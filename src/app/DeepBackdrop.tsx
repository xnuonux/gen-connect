'use client';
import EmeraldShader from '../design-system/deep/EmeraldShader';

// THE DEEP · gen connect substrate. the rough-cut emerald (left) + ruby (right), GEN's stone.
// mounted once in the root layout; renders behind everything.
export default function DeepBackdrop() {
  return <EmeraldShader position="fixed" dim={0.9} />;
}
