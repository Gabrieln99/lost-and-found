const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const Factory = await hre.ethers.getContractFactory("LostAndFound");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = await deployTx.wait();

  const artifact = await hre.artifacts.readArtifact("LostAndFound");

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${hre.network.name}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network: hre.network.name,
        address,
        deployBlock: receipt.blockNumber,
        abi: artifact.abi,
      },
      null,
      2
    )
  );

  console.log(`LostAndFound deployan na ${address} (blok ${receipt.blockNumber}, mreza ${hre.network.name})`);
  console.log(`Zapisano u ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
