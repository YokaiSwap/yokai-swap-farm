import {
  Contract,
  ContractFactory,
  Overrides,
  providers,
} from "ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
  formatUnits,
  getGasPrice,
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

  const [monsterTxReceipts, transactionSubmitter] = await Promise.all([
    TransactionSubmitter.loadReceipts(
      `deploy-monster${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    ),
    TransactionSubmitter.newWithHistory(
      `deploy-master-chef${networkSuffix ? `-${networkSuffix}` : ""}.json`,
      Boolean(process.env.IGNORE_HISTORY),
    ),
  ]);

  const monsterTxReceipt = monsterTxReceipts[`Deploy MonsterToken`];
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
        10,
      );
      tx.gasPrice = gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const masterChefAddress = receipt.contractAddress;
  console.log(`    MasterChef address:`, masterChefAddress);
  const masterChef = new Contract(masterChefAddress, MasterChef.abi, deployer);
  console.log("    MasterChef.yok:", await masterChef.callStatic.yok());
  console.log("    MasterChef.monster:", await masterChef.callStatic.monster());
  console.log(
    "    MasterChef.yokPerSecond:",
    formatUnits(await masterChef.callStatic.yokPerSecond(), 18),
    "YOK",
  );
  console.log(
    "    MasterChef.startTime:",
    (await masterChef.callStatic.startTime()).toString(),
  );

  await transactionSubmitter.submitAndWait(
    `Transfer MONSTER ownership to MasterChef`,
    () => {
      return monster.transferOwnership(masterChefAddress, {...txOverrides, gasPrice});
    },
  );

  console.log("    MonsterToken.owner:", await monster.callStatic.owner());
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
