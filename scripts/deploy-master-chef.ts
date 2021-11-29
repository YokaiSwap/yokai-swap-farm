import { Contract, ContractFactory, Overrides, providers } from "ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import MasterChef from "../artifacts/contracts/MasterChef.sol/MasterChef.json";
import MonsterToken from "../artifacts/contracts/MonsterToken.sol/MonsterToken.json";

type TransactionResponse = providers.TransactionResponse;

interface IOwnable extends Contract {
  transferOwnership(
    newOwner: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 12_500_000 : undefined,
};

async function main() {
  console.log("Deployer Ethereum address:", deployerAddress);

  await initGWAccountIfNeeded(deployerAddress);

  const [yokAndMonsterTxReceipts, transactionSubmitter] = await Promise.all([
    TransactionSubmitter.loadReceipts(
      `deploy-yok-and-monster${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    ),
    TransactionSubmitter.newWithHistory(
      `deploy-master-chef${networkSuffix ? `-${networkSuffix}` : ""}.json`,
      Boolean(process.env.IGNORE_HISTORY),
    ),
  ]);

  const yokTxReceipt = yokAndMonsterTxReceipts[`Deploy YOKToken`];
  if (yokTxReceipt == null) {
    throw new Error("Failed to get YOK address");
  }
  const yokAddress = yokTxReceipt.contractAddress;

  const monsterTxReceipt = yokAndMonsterTxReceipts[`Deploy MonsterToken`];
  if (monsterTxReceipt == null) {
    throw new Error("Failed to get MONSTER address");
  }
  const monsterAddress = monsterTxReceipt.contractAddress;
  const monster = new Contract(
    monsterAddress,
    MonsterToken.abi,
    deployer,
  ) as IOwnable;

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy MasterChef`,
    () => {
      const implementationFactory = new ContractFactory(
        MasterChef.abi,
        MasterChef.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        yokAddress,
        monsterAddress,
        // TODO: replace with production value
        "16666666666666666", // 0.016666666666666666 per second, 1 YOK per minute
        Math.floor(Date.now() / 1000),
      );
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const masterChefAddress = receipt.contractAddress;
  console.log(`    MasterChef address:`, masterChefAddress);

  await transactionSubmitter.submitAndWait(
    `Transfer MONSTER ownership to MasterChef`,
    () => {
      return monster.transferOwnership(masterChefAddress, txOverrides);
    },
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
