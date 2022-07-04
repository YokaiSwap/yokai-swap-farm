import { ContractFactory, Contract } from "ethers";
import { PolyjuiceJsonRpcProvider } from "@polyjuice-provider/ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  isGodwokenV0,
  networkSuffix,
  rpc,
  getGasPrice
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import YOKVault from "../artifacts/contracts/YOKVault.sol/YOKVault.json";

const deployerAddress = deployer.address;

const txOverrides = {
  gasLimit: isGodwoken ? 500_000 : undefined,
};

const { YOK_ADDRESS } = process.env;
if (YOK_ADDRESS == null) {
  console.log("process.env.YOK_ADDRESS is required");
  process.exit(1);
}
const yokAddress = YOK_ADDRESS;

async function main() {
  console.log("Deployer Ethereum address:", deployerAddress);

  await initGWAccountIfNeeded(deployerAddress);

  const gasPrice = await getGasPrice();

  let deployerRecipientAddress = deployerAddress;
  if (isGodwokenV0) {
    const { godwoker } = rpc as PolyjuiceJsonRpcProvider;
    deployerRecipientAddress =
      godwoker.computeShortAddressByEoaEthAddress(deployerAddress);
    console.log("Deployer Godwoken address:", deployerRecipientAddress);
  }

  const [monsterTxReceipts, masterChefTxReceipts, transactionSubmitter] =
    await Promise.all([
      TransactionSubmitter.loadReceipts(
        `deploy-monster${
          networkSuffix ? `-${networkSuffix}` : ""
        }.json`,
      ),
      TransactionSubmitter.loadReceipts(
        `deploy-master-chef${networkSuffix ? `-${networkSuffix}` : ""}.json`,
      ),
      TransactionSubmitter.newWithHistory(
        `deploy-yok-vault${networkSuffix ? `-${networkSuffix}` : ""}.json`,
        Boolean(process.env.IGNORE_HISTORY),
      ),
    ]);

  const monsterTxReceipt = monsterTxReceipts[`Deploy MonsterToken`];
  if (monsterTxReceipt == null) {
    throw new Error("Failed to get MONSTER address");
  }
  const monsterAddress = monsterTxReceipt.contractAddress;

  const masterChefTxReceipt = masterChefTxReceipts[`Deploy MasterChef`];
  if (masterChefTxReceipt == null) {
    throw new Error("Failed to get MasterChef address");
  }
  const masterChefAddress = masterChefTxReceipt.contractAddress;

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy YOKVault`,
    () => {
      const implementationFactory = new ContractFactory(
        YOKVault.abi,
        YOKVault.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        yokAddress,
        monsterAddress,
        masterChefAddress,
        deployerRecipientAddress,
        deployerRecipientAddress,
      );
      tx.gasPrice = gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const yokVaultAddress = receipt.contractAddress;
  console.log(`    YOKVault address:`, yokVaultAddress);
  const yokVault = new Contract(yokVaultAddress, YOKVault.abi, deployer);
  console.log(`    YOKVault.token`, await yokVault.callStatic.token());
  console.log(
    `    YOKVault.receiptToken`,
    await yokVault.callStatic.receiptToken(),
  );
  console.log(
    `    YOKVault.masterchef`,
    await yokVault.callStatic.masterchef(),
  );
  console.log(`    YOKVault.admin`, await yokVault.callStatic.admin());
  console.log(`    YOKVault.treasury`, await yokVault.callStatic.treasury());
  console.log("    YOKVault.owner:", await yokVault.callStatic.owner());
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
