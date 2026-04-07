const hre = require("hardhat");

async function main() {
  console.log("Deploying Vantaguard Shadow Vault...");

  // Oku Position Manager on Etherlink
  const POSITION_MANAGER = "0x743E03cceB4af2efA3CC76838f6E8B50B63F184c";
  
  // Oku Swap Router on Etherlink
  const SWAP_ROUTER = "0xdD489C75be1039ec7d843A6aC2Fd658350B067Cf";

  const Factory = await hre.ethers.getContractFactory("ShadowVaultFactory");
  const factory = await Factory.deploy(POSITION_MANAGER, SWAP_ROUTER);

  await factory.waitForDeployment();

  const address = await factory.getAddress();
  console.log(`✅ ShadowVaultFactory deployed to: ${address}`);
  console.log(`🔗 Explorer: https://explorer.shadownet.etherlink.com/address/${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});