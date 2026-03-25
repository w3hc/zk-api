/**
 * Type declarations for circomlibjs
 * circomlibjs does not provide official TypeScript types
 */

declare module 'circomlibjs' {
  export function buildBabyjub(): Promise<any>;
  export function buildEddsa(): Promise<any>;
  export function buildPoseidon(): Promise<any>;
  export function buildMimc7(): Promise<any>;
  export function buildMimcsponge(): Promise<any>;
  export function buildPedersenHash(): Promise<any>;
  export function buildSMT(): Promise<any>;
}
