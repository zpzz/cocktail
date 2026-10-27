export const WORKBENCH_STEPS = ['杯型', '材料', '调配'] as const;

export type WorkbenchStepLabel = (typeof WORKBENCH_STEPS)[number];
