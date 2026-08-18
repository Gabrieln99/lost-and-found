// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LostAndFound
/// @notice Decentralizirani escrow sustav za nagrade za pronadene izgubljene predmete.
///         Vlasnik zakljuca nagradu prilikom objave oglasa. Sredstva se isplacuju
///         nalazniku tek nakon sto ih vlasnik potvrdi. Ako se predmet ne pronade
///         u zadanom roku, vlasnik moze povuci sredstva natrag.
contract LostAndFound {
    enum State {
        Open,      // oglas aktivan, ceka se prijava pronalaska
        Claimed,   // netko je prijavio da je pronasao predmet, ceka se potvrda vlasnika
        Resolved,  // vlasnik potvrdio, sredstva isplacena nalazniku
        Expired    // rok istekao bez potvrdenog pronalaska, sredstva vracena vlasniku
    }

    struct Bounty {
        address payable owner;
        address payable finder;
        uint256 amount;
        uint256 deadline;
        State state;
        string description; // kratak opis + IPFS CID slike, spojeno offchain formatom "opis|cid"
    }

    uint256 public bountyCount;
    mapping(uint256 => Bounty) public bounties;

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed owner,
        uint256 amount,
        uint256 deadline,
        string description
    );

    event ItemClaimed(uint256 indexed bountyId, address indexed finder, string proofCid);

    event BountyResolved(uint256 indexed bountyId, address indexed finder, uint256 amount);

    event BountyExpiredAndRefunded(uint256 indexed bountyId, address indexed owner, uint256 amount);

    modifier onlyOwner(uint256 bountyId) {
        require(msg.sender == bounties[bountyId].owner, "Samo vlasnik oglasa moze ovo pozvati");
        _;
    }

    modifier bountyExists(uint256 bountyId) {
        require(bountyId < bountyCount, "Oglas ne postoji");
        _;
    }

    modifier inState(uint256 bountyId, State expected) {
        require(bounties[bountyId].state == expected, "Oglas nije u odgovarajucem stanju");
        _;
    }

    /// @notice Objava novog oglasa uz uplatu nagrade. Nagrada se zakljucava u ugovoru.
    /// @param description Opis izgubljenog predmeta (preporuceno: tekst + IPFS CID slike)
    /// @param durationInDays Broj dana nakon kojih vlasnik moze povuci sredstva ako predmet nije pronaden
    function createBounty(string calldata description, uint256 durationInDays)
        external
        payable
        returns (uint256 bountyId)
    {
        require(msg.value > 0, "Nagrada mora biti veca od 0");
        require(durationInDays > 0 && durationInDays <= 365, "Neispravno trajanje roka");

        bountyId = bountyCount;
        bountyCount++;

        bounties[bountyId] = Bounty({
            owner: payable(msg.sender),
            finder: payable(address(0)),
            amount: msg.value,
            deadline: block.timestamp + durationInDays * 1 days,
            state: State.Open,
            description: description
        });

        emit BountyCreated(bountyId, msg.sender, msg.value, block.timestamp + durationInDays * 1 days, description);
    }

    /// @notice Nalaznik prijavljuje pronalazak i prilaze dokaz (npr. IPFS CID slike/hasha).
    /// @param proofCid IPFS CID dokaza o pronalasku, ili prazan string ako nije primjenjivo
    function claimItem(uint256 bountyId, string calldata proofCid)
        external
        bountyExists(bountyId)
        inState(bountyId, State.Open)
    {
        Bounty storage b = bounties[bountyId];
        require(block.timestamp < b.deadline, "Rok za prijavu je istekao");
        require(msg.sender != b.owner, "Vlasnik ne moze biti nalaznik");

        b.finder = payable(msg.sender);
        b.state = State.Claimed;

        emit ItemClaimed(bountyId, msg.sender, proofCid);
    }

    /// @notice Vlasnik potvrduje primopredaju i oslobada isplatu nalazniku.
    ///         Koristi check-effects-interactions obrazac radi zastite od reentrancy napada.
    function confirmAndPay(uint256 bountyId)
        external
        bountyExists(bountyId)
        onlyOwner(bountyId)
        inState(bountyId, State.Claimed)
    {
        Bounty storage b = bounties[bountyId];

        uint256 payoutAmount = b.amount;
        address payable finder = b.finder;

        // Effects prije interactions
        b.state = State.Resolved;
        b.amount = 0;

        emit BountyResolved(bountyId, finder, payoutAmount);

        (bool success, ) = finder.call{value: payoutAmount}("");
        require(success, "Isplata nalazniku nije uspjela");
    }

    /// @notice Ako predmet nije pronaden (ili nalaznik nije potvrden) do isteka roka,
    ///         vlasnik moze povuci zakljucana sredstva natrag.
    function refundExpired(uint256 bountyId)
        external
        bountyExists(bountyId)
        onlyOwner(bountyId)
    {
        Bounty storage b = bounties[bountyId];
        require(b.state == State.Open || b.state == State.Claimed, "Oglas vise nije aktivan");
        require(block.timestamp >= b.deadline, "Rok jos nije istekao");

        uint256 refundAmount = b.amount;

        b.state = State.Expired;
        b.amount = 0;

        emit BountyExpiredAndRefunded(bountyId, b.owner, refundAmount);

        (bool success, ) = b.owner.call{value: refundAmount}("");
        require(success, "Povrat sredstava vlasniku nije uspio");
    }

    function getBounty(uint256 bountyId)
        external
        view
        bountyExists(bountyId)
        returns (
            address owner,
            address finder,
            uint256 amount,
            uint256 deadline,
            State state,
            string memory description
        )
    {
        Bounty storage b = bounties[bountyId];
        return (b.owner, b.finder, b.amount, b.deadline, b.state, b.description);
    }
}
