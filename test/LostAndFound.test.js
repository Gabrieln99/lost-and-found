const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("LostAndFound", function () {
  let contract, owner, finder, other;
  const ONE_ETH = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, finder, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("LostAndFound");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  it("kreira bounty i emitira BountyCreated event", async function () {
    await expect(
      contract.connect(owner).createBounty("Izgubljen macak|QmHash123", 7, { value: ONE_ETH })
    )
      .to.emit(contract, "BountyCreated")
      .withArgs(0, owner.address, ONE_ETH, anyValue, "Izgubljen macak|QmHash123");
  });

  it("prima nagradu (msg.value) i sprema ispravno stanje", async function () {
    await contract.connect(owner).createBounty("Izgubljen pas", 7, { value: ONE_ETH });
    const b = await contract.getBounty(0);
    expect(b.amount).to.equal(ONE_ETH);
    expect(b.state).to.equal(0); // Open
    expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(ONE_ETH);
  });

  it("odbija createBounty bez uplate", async function () {
    await expect(
      contract.connect(owner).createBounty("Test", 7)
    ).to.be.revertedWith("Nagrada mora biti veca od 0");
  });

  it("dopusta nalazniku da prijavi pronalazak", async function () {
    await contract.connect(owner).createBounty("Kljucevi", 7, { value: ONE_ETH });
    await expect(contract.connect(finder).claimItem(0, "QmProofHash"))
      .to.emit(contract, "ItemClaimed")
      .withArgs(0, finder.address, "QmProofHash");

    const b = await contract.getBounty(0);
    expect(b.state).to.equal(1); // Claimed
    expect(b.finder).to.equal(finder.address);
  });

  it("sprjecava vlasnika da bude vlastiti nalaznik", async function () {
    await contract.connect(owner).createBounty("Test", 7, { value: ONE_ETH });
    await expect(
      contract.connect(owner).claimItem(0, "hash")
    ).to.be.revertedWith("Vlasnik ne moze biti nalaznik");
  });

  it("sprjecava dupli claim istog oglasa", async function () {
    await contract.connect(owner).createBounty("Test", 7, { value: ONE_ETH });
    await contract.connect(finder).claimItem(0, "hash1");
    await expect(
      contract.connect(other).claimItem(0, "hash2")
    ).to.be.revertedWith("Oglas nije u odgovarajucem stanju");
  });

  it("isplacuje nalazniku nakon potvrde vlasnika i azurira stanje ugovora", async function () {
    await contract.connect(owner).createBounty("Test", 7, { value: ONE_ETH });
    await contract.connect(finder).claimItem(0, "hash");

    const balanceBefore = await ethers.provider.getBalance(finder.address);

    await expect(contract.connect(owner).confirmAndPay(0))
      .to.emit(contract, "BountyResolved")
      .withArgs(0, finder.address, ONE_ETH);

    const balanceAfter = await ethers.provider.getBalance(finder.address);
    expect(balanceAfter - balanceBefore).to.equal(ONE_ETH);

    const b = await contract.getBounty(0);
    expect(b.state).to.equal(2); // Resolved
    expect(b.amount).to.equal(0);
  });

  it("sprjecava da netko tko nije vlasnik potvrdi isplatu", async function () {
    await contract.connect(owner).createBounty("Test", 7, { value: ONE_ETH });
    await contract.connect(finder).claimItem(0, "hash");
    await expect(
      contract.connect(other).confirmAndPay(0)
    ).to.be.revertedWith("Samo vlasnik oglasa moze ovo pozvati");
  });

  it("sprjecava isplatu prije nego je itko prijavio pronalazak", async function () {
    await contract.connect(owner).createBounty("Test", 7, { value: ONE_ETH });
    await expect(
      contract.connect(owner).confirmAndPay(0)
    ).to.be.revertedWith("Oglas nije u odgovarajucem stanju");
  });

  it("sprjecava refund prije isteka roka", async function () {
    await contract.connect(owner).createBounty("Test", 7, { value: ONE_ETH });
    await expect(
      contract.connect(owner).refundExpired(0)
    ).to.be.revertedWith("Rok jos nije istekao");
  });

  it("dopusta vlasniku povrat sredstava nakon isteka roka bez pronalaska", async function () {
    await contract.connect(owner).createBounty("Test", 1, { value: ONE_ETH });
    await time.increase(2 * 24 * 60 * 60); // +2 dana

    const balanceBefore = await ethers.provider.getBalance(owner.address);
    const tx = await contract.connect(owner).refundExpired(0);
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    const balanceAfter = await ethers.provider.getBalance(owner.address);

    expect(balanceAfter - balanceBefore + gasUsed).to.equal(ONE_ETH);

    const b = await contract.getBounty(0);
    expect(b.state).to.equal(3); // Expired
  });

  it("sprjecava refund ako je oglas vec rijesen", async function () {
    await contract.connect(owner).createBounty("Test", 1, { value: ONE_ETH });
    await contract.connect(finder).claimItem(0, "hash");
    await contract.connect(owner).confirmAndPay(0);
    await time.increase(2 * 24 * 60 * 60);

    await expect(
      contract.connect(owner).refundExpired(0)
    ).to.be.revertedWith("Oglas vise nije aktivan");
  });

  it("sprjecava claim nakon isteka roka", async function () {
    await contract.connect(owner).createBounty("Test", 1, { value: ONE_ETH });
    await time.increase(2 * 24 * 60 * 60);

    await expect(
      contract.connect(finder).claimItem(0, "hash")
    ).to.be.revertedWith("Rok za prijavu je istekao");
  });
});
