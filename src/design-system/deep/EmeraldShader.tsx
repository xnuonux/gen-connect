'use client';
// THE DEEP · GEN CONNECT · the rough-cut EMERALD shader (dom's vision, 2026-07-03).
// a deep-green emerald mass with crystalline INCLUSIONS (voronoi facets/fractures) weighted heavy on the
// LEFT edge, prominent, fading toward the void center-right, with burmese-RUBY / oxblood pooling on the RIGHT.
// same dreamslur family as DeepShader (fbm domain-warp + 4x4 bayer dither) but emerald-composed + asymmetric.
// GEN's stone (forest green #2d5f3f). raw WebGL, one fullscreen triangle, StrictMode-safe (no loseContext).
import { useEffect, useRef } from 'react';

const FRAG = `
precision highp float;
uniform vec2 R; uniform float T; uniform float DIM;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 h2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}
// voronoi ... F1 (cell glow) + F2-F1 (the sharp inclusion/facet EDGES of the crystal)
vec2 voro(vec2 p){
  vec2 g=floor(p),f=fract(p); float f1=8.,f2=8.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(float(x),float(y)); vec2 r=o+h2(g+o)-f; float d=dot(r,r);
    if(d<f1){f2=f1;f1=d;} else if(d<f2){f2=d;}
  }
  return vec2(sqrt(f1),sqrt(f2));
}
float bayer(vec2 c){int x=int(mod(c.x,4.)),y=int(mod(c.y,4.));int idx=x+y*4;
  float m[16];m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
  m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  float v=0.;for(int k=0;k<16;k++){if(k==idx)v=m[k];}return v/16.;}
vec3 emeraldRamp(float t){
  vec3 v=vec3(0.024,0.031,0.027);  // near-void green-black
  vec3 a=vec3(0.039,0.121,0.082);  // deep emerald shadow (#0a1f14)
  vec3 b=vec3(0.176,0.372,0.247);  // emerald body (#2d5f3f)
  vec3 c=vec3(0.290,0.560,0.373);  // lit emerald (#4a8f5f)
  t=clamp(t,0.,1.);
  if(t<.34)return mix(v,a,t/.34);
  if(t<.68)return mix(a,b,(t-.34)/.34);
  return mix(b,c,(t-.68)/.32);
}
void main(){
  vec2 uv=gl_FragCoord.xy/R.xy; vec2 p=uv*vec2(R.x/R.y,1.)*2.6; float t=T*.016;
  // domain-warped fbm body (the organic emerald mass)
  vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,-t*.7)));
  vec2 r=vec2(fbm(p+2.4*q+vec2(1.7,t*.5)),fbm(p+2.4*q+vec2(8.3,-t*.4)));
  float f=fbm(p+3.2*r); f=pow(f,1.3);
  // crystalline inclusions ... voronoi facets, drifting slowly
  vec2 vo=voro(p*1.9+q*0.6+vec2(t*0.15,0.));
  float facet=smoothstep(0.02,0.14,vo.y-vo.x);      // sharp bright edges between cells
  float shard=pow(1.-vo.x,2.2);                      // cell-core glow (the inclusion bodies)
  // LEFT-weighted emerald mask ... the mass sits left, prominent, fades center-right
  float leftMass=smoothstep(1.05,-0.15,uv.x);        // 1 at left edge -> 0 past center
  float emVal=(f*0.7+shard*0.5)*mix(0.4,1.15,leftMass);
  vec3 col=emeraldRamp(emVal);
  col+=vec3(0.36,0.72,0.5)*facet*leftMass*0.5;       // inclusion facet sparkle (emerald-white), left only
  // RIGHT-side burmese-ruby / oxblood pooling
  float rightMass=smoothstep(0.42,1.08,uv.x);        // 0 at center -> 1 at right edge
  float rf=fbm(p*1.3+vec2(-t*0.5,t*0.3));
  vec3 ruby=mix(vec3(0.17,0.0,0.03),vec3(0.66,0.06,0.14),clamp(rf*1.6,0.,1.));
  ruby+=vec3(0.82,0.12,0.2)*pow(rf,3.0)*0.5;          // ruby highlights
  col=mix(col,ruby,rightMass*(0.55+0.35*rf));
  // vignette + the shared bayer dither (keeps it in the dreamslur family)
  float vg=smoothstep(1.3,.2,length(uv-vec2(0.35,0.5)));
  col*=mix(.6,1.06,vg);
  float levels=6.; float dv=bayer(gl_FragCoord.xy)-.5;
  col=floor((col+dv*(1./levels))*levels)/levels;
  col*=DIM;
  gl_FragColor=vec4(col,1.);
}`;
const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

export interface EmeraldShaderProps { dim?: number; position?: 'fixed' | 'absolute'; className?: string; style?: React.CSSProperties; }

export default function EmeraldShader({ dim = 0.86, position = 'fixed', className, style }: EmeraldShaderProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const gl = cv.getContext('webgl', { antialias: false, alpha: true, powerPreference: 'low-power' });
    if (!gl) { cv.style.display = 'none'; return; }
    const sh = (ty: number, s: string) => {
      const o = gl.createShader(ty)!; gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error('[emerald] compile: ' + gl.getShaderInfoLog(o));
      return o;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.error('[emerald] link: ' + gl.getProgramInfoLog(pr)); cv.style.display = 'none'; return; }
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T'), uD = gl.getUniformLocation(pr, 'DIM');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const size = () => { cv.width = Math.floor(window.innerWidth * dpr); cv.height = Math.floor(window.innerHeight * dpr); gl.viewport(0, 0, cv.width, cv.height); };
    size(); window.addEventListener('resize', size, { passive: true });
    const t0 = performance.now(); let raf = 0; let alive = true;
    const loop = () => { if (!alive) return; gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, (performance.now() - t0) / 1000); gl.uniform1f(uD, dim); gl.drawArrays(gl.TRIANGLES, 0, 3); raf = requestAnimationFrame(loop); };
    loop();
    // NOTE: no loseContext() ... StrictMode double-mount would kill the remount's context (the deep-v2 trap).
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, [dim]);
  return <canvas ref={ref} aria-hidden className={className}
    style={{ position, inset: 0, width: '100%', height: '100%', zIndex: 0, display: 'block',
      background: 'linear-gradient(105deg, #0a1f14 0%, #08090e 52%, #1c0407 100%)', ...style }} />;
}
