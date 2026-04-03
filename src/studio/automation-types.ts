import type { ModelResult } from "../engine/types.js";

export type CameraView = "front" | "back" | "top" | "bottom" | "left" | "right" | "iso";
export type CrossSectionAxis = "x" | "y" | "z";
export type Vec3 = [number, number, number];

export interface CadladAutomationApi {
  setCode(code: string): void;
  run(): Promise<ModelResult | null>;
  getResult(): ModelResult | null;
  getErrors(): string;
  hasError(): boolean;
  getParams(): Record<string, number>;
  setParam(name: string, value: number): Promise<void>;
  setView(view: CameraView): void;
  setCameraPosition(pos: Vec3, target?: Vec3): void;
  getCameraPosition(): Vec3;
  captureFrame(view?: CameraView): string;
  setCrossSection(axis: CrossSectionAxis, offset: number): void;
  clearCrossSection(): void;
}

declare global {
  interface Window {
    __cadlad?: CadladAutomationApi;
  }
}
