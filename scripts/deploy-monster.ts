import {
  ContractFactory,
  Contract,
} from "ethers";

import {
  deployer,
  getGasPrice,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import MonsterToken from "../artifacts/contracts/MonsterToken.sol/MonsterToken.json";

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

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `deploy-monster${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy MonsterToken`,
    () => {
      const implementationFactory = new ContractFactory(
        MonsterToken.abi,
        MonsterToken.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(yokAddress);
      tx.gasPrice = gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const monsterAddress = receipt.contractAddress;
  console.log(`    MonsterToken address:`, monsterAddress);

  const monster = new Contract(monsterAddress, MonsterToken.abi, deployer);
  console.log("    MonsterToken.owner:", await monster.callStatic.owner());
  console.log("    MonsterToken.yok:", await monster.callStatic.yok());
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
