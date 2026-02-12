const DEFAULT_TARGET_RANGE = [40, 180];
const DEFAULT_REWARD_RANGE = [450, 2200];
const DEFAULT_CONTRACTS_PER_DAY = 3;

const pick = (list, random = Math.random) => {
  if (!Array.isArray(list) || !list.length) return null;
  const index = Math.floor(Math.max(0, Math.min(0.9999, random())) * list.length);
  return list[index] ?? list[list.length - 1];
};

const rollRange = ([min, max], random = Math.random) => {
  const low = Number.isFinite(min) ? min : 1;
  const high = Number.isFinite(max) ? Math.max(low, max) : low;
  return Math.round(low + (high - low) * random());
};

export function createOperationsState() {
  return {
    reputation: 0,
    completed: 0,
    failed: 0,
    contracts: [],
    nextContractId: 1,
    lastIssuedDay: 0
  };
}

export function ensureOperationsState(state) {
  if (!state || typeof state !== "object") return createOperationsState();
  if (!state.operations || typeof state.operations !== "object") {
    state.operations = createOperationsState();
    return state.operations;
  }
  const ops = state.operations;
  if (!Array.isArray(ops.contracts)) ops.contracts = [];
  if (!Number.isFinite(ops.reputation)) ops.reputation = 0;
  if (!Number.isFinite(ops.completed)) ops.completed = 0;
  if (!Number.isFinite(ops.failed)) ops.failed = 0;
  if (!Number.isFinite(ops.nextContractId) || ops.nextContractId < 1) ops.nextContractId = 1;
  if (!Number.isFinite(ops.lastIssuedDay) || ops.lastIssuedDay < 0) ops.lastIssuedDay = 0;
  return ops;
}

function createContract(state, { random = Math.random } = {}) {
  const ops = ensureOperationsState(state);
  const assets = Array.isArray(state?.assets) ? state.assets : [];
  const asset = pick(assets, random);
  if (!asset?.id) return null;

  const side = pick(["buy", "sell", "either"], random) ?? "either";
  const targetQty = Math.max(10, rollRange(DEFAULT_TARGET_RANGE, random));
  const dueInDays = pick([1, 2, 2, 3], random) ?? 2;
  const rewardCash = Math.max(100, rollRange(DEFAULT_REWARD_RANGE, random));
  const rewardRep = Math.max(1, Math.round(targetQty / 35));
  const id = `CTR-${ops.nextContractId}`;
  ops.nextContractId += 1;

  const sideLabel = side === "either" ? "Trade" : side === "buy" ? "Acquire" : "Offload";

  return {
    id,
    label: `${sideLabel} ${asset.id} flow`,
    assetId: asset.id,
    side,
    targetQty,
    progressQty: 0,
    rewardCash,
    rewardRep,
    issuedDay: Number.isFinite(state?.day) ? state.day : 1,
    dueDay: (Number.isFinite(state?.day) ? state.day : 1) + dueInDays,
    status: "active"
  };
}

export function primeOperationsForDay(state, { random = Math.random, contractsPerDay = DEFAULT_CONTRACTS_PER_DAY } = {}) {
  const ops = ensureOperationsState(state);
  const day = Number.isFinite(state?.day) ? state.day : 1;

  if (ops.lastIssuedDay === day) return ops;

  ops.contracts = ops.contracts.filter((contract) => contract && (contract.status === "active" || contract.status === "completed"));

  while (ops.contracts.filter((contract) => contract.status === "active").length < contractsPerDay) {
    const contract = createContract(state, { random });
    if (!contract) break;
    ops.contracts.push(contract);
  }

  ops.lastIssuedDay = day;
  return ops;
}

export function recordOperationsTrade(state, { id, side, qty }) {
  const ops = ensureOperationsState(state);
  if (!id || !Number.isFinite(qty) || qty <= 0) return;
  const tradeSide = side === "sell" ? "sell" : "buy";

  ops.contracts.forEach((contract) => {
    if (!contract || contract.status !== "active") return;
    if (contract.assetId !== id) return;
    if (contract.side !== "either" && contract.side !== tradeSide) return;
    contract.progressQty = Math.min(contract.targetQty, (contract.progressQty || 0) + qty);
    if (contract.progressQty >= contract.targetQty) {
      contract.status = "completed";
    }
  });
}

export function resolveExpiredContracts(state) {
  const ops = ensureOperationsState(state);
  const day = Number.isFinite(state?.day) ? state.day : 1;
  let failedNow = 0;

  ops.contracts.forEach((contract) => {
    if (!contract || contract.status !== "active") return;
    if (!Number.isFinite(contract.dueDay)) return;
    if (day > contract.dueDay) {
      contract.status = "failed";
      failedNow += 1;
    }
  });

  if (failedNow > 0) {
    ops.failed += failedNow;
  }

  return failedNow;
}

export function claimCompletedContract(state, contractId) {
  const ops = ensureOperationsState(state);
  const contract = ops.contracts.find((item) => item?.id === contractId);
  if (!contract || contract.status !== "completed") {
    return { success: false };
  }

  const cashReward = Number.isFinite(contract.rewardCash) ? contract.rewardCash : 0;
  const repReward = Number.isFinite(contract.rewardRep) ? contract.rewardRep : 0;

  state.cash += cashReward;
  ops.reputation += repReward;
  ops.completed += 1;
  contract.status = "claimed";

  return {
    success: true,
    cashReward,
    repReward,
    contract
  };
}

export function summarizeOperations(state) {
  const ops = ensureOperationsState(state);
  const active = ops.contracts.filter((contract) => contract?.status === "active");
  const completed = ops.contracts.filter((contract) => contract?.status === "completed");

  return {
    reputation: ops.reputation,
    completed: ops.completed,
    failed: ops.failed,
    activeCount: active.length,
    readyToClaim: completed.length,
    activeContracts: active,
    claimableContracts: completed
  };
}
