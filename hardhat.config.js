require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    etherlink_shadownet: {
      url: "https://node.shadownet.etherlink.com",
      accounts: ["161a61dcf4480b5663d66f08144542f9f84359df3cb589d97bd5b79ac1f498e7"],
    },
  },
};