import { ContractFactory } from "ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import YOKToken from "../artifacts/contracts/YOKToken.sol/YOKToken.json";
import MonsterToken from "../artifacts/contracts/MonsterToken.sol/MonsterToken.json";

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 12_500_000 : undefined,
};

async function main() {
  console.log("Deployer Ethereum address:", deployerAddress);

  await initGWAccountIfNeeded(deployerAddress);

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `deploy-yok-and-monster${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy YOKToken`,
    () => {
      const implementationFactory = new ContractFactory(
        YOKToken.abi,
        YOKToken.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const yokAddress = receipt.contractAddress;
  console.log(`    YOKToken address:`, yokAddress);

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy MonsterToken`,
    () => {
      const implementationFactory = new ContractFactory(
        MonsterToken.abi,
        MonsterToken.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(yokAddress);
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const monsterAddress = receipt.contractAddress;
  console.log(`    MonsterToken address:`, monsterAddress);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
