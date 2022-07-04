import { PolyjuiceConfig } from "@polyjuice-provider/base";
import {
  PolyjuiceJsonRpcProvider,
  PolyjuiceWallet,
} from "@polyjuice-provider/ethers";
import dotenv from "dotenv";
import axios from "axios";
import { ethers } from "ethers";
import path from "path";

console.log(
  "Using .env config:",
  path.resolve(process.env.ENV_PATH ?? "./.env"),
);
dotenv.config({
  path: path.resolve(process.env.ENV_PATH ?? "./.env"),
});
axios.defaults.withCredentials = true;

const { DEPLOYER_PRIVATE_KEY, NETWORK_SUFFIX, GODWOKEN_API_URL, RPC_URL } =
  process.env;
if (DEPLOYER_PRIVATE_KEY == null) {
  console.log("process.env.DEPLOYER_PRIVATE_KEY is required");
  process.exit(1);
}

if (RPC_URL == null) {
  console.log("process.env.RPC_URL is required");
  process.exit(1);
}

export const defaultRPC = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL,
);
export const defaultDeployer = new ethers.Wallet(
  DEPLOYER_PRIVATE_KEY,
  defaultRPC,
);

export const networkSuffix = NETWORK_SUFFIX;
export const isGodwoken = networkSuffix?.startsWith("gw");
export const isGodwokenV0 = isGodwoken && !networkSuffix?.startsWith("gw-v1");

export const polyjuiceConfig: PolyjuiceConfig = {
  rollupTypeHash: process.env.ROLLUP_TYPE_HASH!,
  ethAccountLockCodeHash: process.env.ETH_ACCOUNT_LOCK_CODE_HASH!,
  web3Url: RPC_URL,
};

export const polyjuiceRPC = new PolyjuiceJsonRpcProvider(
  polyjuiceConfig,
  RPC_URL,
);
export const polyjuiceDeployer = new PolyjuiceWallet(
  DEPLOYER_PRIVATE_KEY,
  polyjuiceConfig,
  polyjuiceRPC,
);

export async function initGWAccountIfNeeded(
  account: string,
  usingRPC = polyjuiceRPC,
) {
  if (!isGodwoken) {
    return;
  }

  let accountID: string | null = null;
  try {
    accountID = await usingRPC.godwoker.getAccountIdByEoaEthAddress(account);
  } catch (err: any) {
    if (!err?.message.includes("unable to fetch account id")) {
      throw err;
    }
  }

  if (accountID != null) {
    return;
  }

  if (networkSuffix !== "gw-devnet") {
    throw new Error(
      `Please initialize godwoken account for ${account} by deposit first`,
    );
  }

  console.log(`Running: Initialize Godwoken account for ${account} by deposit`);

  if (GODWOKEN_API_URL == null) {
    throw new Error("process.env.GODWOKEN_API_URL is required");
  }

  console.log("    It may take a few minutes...");

  let res = await axios.get(`${GODWOKEN_API_URL}/deposit`, {
    params: {
      eth_address: account,
    },
  });

  if (res.data.status !== "ok") {
    console.log("    Failed to deposit, res:", res);
    throw new Error();
  }

  console.log(`    Initialized, id:`, res.data.data.account_id);
}

export function unit(n: number | string, decimals = 18): ethers.BigNumber {
  return ethers.utils.parseUnits(n.toString(), decimals);
}

export function beautify(str = ""): string {
  const reg =
    str.indexOf(".") > -1 ? /(\d)(?=(\d{3})+\.)/g : /(\d)(?=(?:\d{3})+$)/g;
  str = str.replace(reg, "$1,");
  return str.replace(/(\.[0-9]*[1-9]+)(0)*/, "$1");
}

export function formatUnits(
  n: number | string,
  decimals: string | number = 18,
): string {
  return beautify(ethers.utils.formatUnits(n.toString(), decimals));
}

export const rpc = isGodwokenV0 ? polyjuiceRPC : defaultRPC;
export const deployer = isGodwokenV0 ? polyjuiceDeployer : defaultDeployer;

export async function getGasPrice() {
  const gasPrice = await rpc.getGasPrice();
  console.log("Gas price:", formatUnits(gasPrice.toString(), "gwei"), "Gwei");

  return gasPrice;
}
