const hre = require("hardhat");

async function main() {
  console.log("Deploying Vantaguard Shadow Vault...");

  // Oku Position Manager on Etherlink
  const POSITION_MANAGER = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  
  // Oku Swap Router on Etherlink
  const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

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