import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/exporter-react-three-fiber",
  kind: "exporter",
  responsibility: "React Three Fiber export adapter shell for future Multi-Stack Export implementation.",
  owns: "React Three Fiber target capability analysis, generation, and validation when that exporter phase begins.",
  mustNotOwn: "Own canonical state or bypass the common exporter contract.",
  status: "PHASE_0_SHELL",
};

export const EXPORTER_REACT_THREE_FIBER_STATUS = packageContract.status;
