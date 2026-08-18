# Lost & Found - Smart Contract

## Postavljanje

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Pokretanje lokalne mreže

```bash
npx hardhat node
```

U drugom terminalu možeš deployati contract skriptom ili preko Hardhat konzole:

```bash
npx hardhat console --network localhost
```

```js
const Factory = await ethers.getContractFactory("LostAndFound");
const contract = await Factory.deploy();
await contract.waitForDeployment();
console.log(await contract.getAddress());
```

## Funkcije ugovora

- `createBounty(description, durationInDays)` — payable, vlasnik uplaćuje nagradu i objavljuje oglas
- `claimItem(bountyId, proofCid)` — nalaznik prijavljuje pronalazak uz dokaz (npr. IPFS CID)
- `confirmAndPay(bountyId)` — vlasnik potvrđuje i oslobađa isplatu nalazniku
- `refundExpired(bountyId)` — vlasnik povlači sredstva ako rok istekne bez potvrđenog pronalaska
- `getBounty(bountyId)` — view funkcija za čitanje stanja oglasa

## Stanja oglasa

`Open → Claimed → Resolved`, ili `Open/Claimed → Expired` (nakon isteka roka)

## Sigurnosne napomene

- Check-effects-interactions obrazac u `confirmAndPay` i `refundExpired` sprječava reentrancy napade
- `onlyOwner` modifier ograničava tko može potvrditi isplatu i tražiti povrat
- Vlasnik ne može biti vlastiti nalaznik (`claimItem` provjera)
