import * as T from '../vendor/three-0.160.0/three.module.js';

const worlds = [
  { atlas: 'vesper', atmosphere: '#e7ab77', tilt: -.32, spin: .030, phase: .67, moon: .060 },
  { atlas: 'pelagos', atmosphere: '#68bcdf', tilt: .21, spin: .019, phase: 2.72, moon: .079 },
  { atlas: 'oriole', atmosphere: '#dba367', tilt: -.13, spin: .024, phase: 1.04, moon: .047 }
];
const source = new T.TextureLoader();
const maps = new Map();
function atlas(name) {
  if (!maps.has(name)) {
    const texture = source.load(new URL('./orbits/' + name + '.webp', import.meta.url).href);
    if (name !== 'cloud-bands') texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = T.RepeatWrapping;
    texture.anisotropy = 2;
    maps.set(name, texture);
  }
  return maps.get(name);
}

// Independent of cabin lighting. Project the same distant sun into the view
// frame for the terminator, atmosphere, the shadow on the rings and the moon.
const celestialVertex = `
  const vec3 sunlight = vec3(-.71, .38, .61);
  varying vec2 chart;
  varying vec3 n, eye, light, pole;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    chart = uv;
    n = normalize(normalMatrix * normal);
    eye = -mv.xyz;
    light = normalize(mat3(viewMatrix) * sunlight);
    pole = normalize(normalMatrix * vec3(0., 1., 0.));
    gl_Position = projectionMatrix * mv;
  }`;
const declarations = 'varying vec2 chart; varying vec3 n, eye, light, pole;';
const output = `
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function surfaceMap(name, haze, ringShadow, moon = false) {
  return new T.ShaderMaterial({
    uniforms: {
      terrain: { value: atlas(name) }, haze: { value: new T.Color(haze) },
      rings: { value: Number(ringShadow) }, moon: { value: Number(moon) }
    },
    vertexShader: celestialVertex,
    fragmentShader: declarations + `
    uniform sampler2D terrain;
    uniform vec3 haze;
    uniform float rings, moon;
    void main() {
      vec3 N = normalize(n), L = normalize(light);
      vec3 color = texture2D(terrain, chart).rgb;
      color = mix(color, vec3(.72,.70,.67) * dot(color, vec3(.28,.57,.15)), moon);
      float incidence = dot(N,L);
      float day = pow(max(incidence,0.), .60);
      if (rings > .5) {
        vec3 up = normalize(pole);
        float slope = dot(L,up);
        if (abs(slope) > .015) {
          float t = -dot(N,up) / slope;
          float radius = length(N+t*L);
          float belt = smoothstep(1.28,1.37,radius)*(1.-smoothstep(1.70,1.93,radius));
          if(t > 0.) day *= 1. - .42*belt;
        }
      }
      float fringe = pow(1.-max(0.,dot(N,normalize(eye))),3.7);
      color *= vec3(.044,.056,.079) + day * vec3(1.02,.96,.89);
      color += haze * (.11*fringe*smoothstep(-.19,.60,incidence)) * (1.-moon);
      gl_FragColor = vec4(color,1.);
    ` + output
  });
}
function cloudLayer(color) {
  return new T.ShaderMaterial({
    uniforms: { weather: { value: atlas('cloud-bands') }, vapor: { value: new T.Color(color) } },
    vertexShader: celestialVertex, transparent: true, depthWrite: false,
    fragmentShader: declarations + `
      uniform sampler2D weather;
      uniform vec3 vapor;
      void main() {
        float density = texture2D(weather,chart).r;
        float day = pow(max(0.,dot(normalize(n),normalize(light))),.58);
        vec3 color = vapor * (vec3(.045,.061,.09) + day * vec3(1.,.98,.95));
        gl_FragColor = vec4(color,density*.89);
      ` + output
  });
}
function atmosphere(haze) {
  return new T.ShaderMaterial({
    uniforms: { tint: { value: new T.Color(haze) } },
    vertexShader: celestialVertex, transparent: true, depthWrite: false, side: T.BackSide,
    fragmentShader: declarations + `
      uniform vec3 tint;
      void main() {
        vec3 N=normalize(n);
        float mu=abs(dot(N,normalize(eye)));
        float sun=smoothstep(-.25,.63,dot(N,normalize(light)));
        gl_FragColor=vec4(tint*(.3+.65*sun), pow(mu/.225,2.)*(.08+.42*sun));
      ` + output
  });
}
function ringDisk() {
  return new T.ShaderMaterial({
    side: T.DoubleSide, transparent: true, depthWrite: false, extensions: { derivatives: true },
    vertexShader: `
      varying vec3 p, sun;
      void main() {
        p=position;
        vec3 worldSun=normalize(mat3(viewMatrix)*vec3(-.71,.38,.61));
        sun=vec3(dot(normalize(normalMatrix[0]),worldSun),dot(normalize(normalMatrix[1]),worldSun),dot(normalize(normalMatrix[2]),worldSun));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader: `
      varying vec3 p, sun;
      float stripe(float r,float frequency) {
        return sin(r*frequency)*(1.-smoothstep(.65,2.9,fwidth(r)*frequency));
      }
      void main() {
        float r=length(p);
        float bands=.52 + .18*stripe(r,117.)+.12*stripe(r,251.)+.10*stripe(r,51.)+.04*stripe(r,499.);
        float cassini=smoothstep(.012,.029,abs(r-1.64));
        float division=smoothstep(.004,.011,abs(r-1.78));
        float edge=smoothstep(1.26,1.39,r)*(1.-smoothstep(1.86,1.96,r));
        vec3 l=normalize(sun);
        float along=dot(-p,l);
        float shadow=along>0.?smoothstep(.87,1.10,length(p+along*l)):1.;
        vec3 ice=mix(vec3(.27,.21,.19),vec3(.78,.64,.45),bands);
        gl_FragColor=vec4(ice*(.27+.73*shadow),edge*division*cassini*(.40+.52*bands));
      ` + output
  });
}

export function planet(index) {
  const world = worlds[index];
  const root = new T.Group(), axis = new T.Group();
  axis.rotation.set(index === 0 ? .34 : .12, 0, world.tilt);
  root.add(axis);
  const surface = new T.Mesh(new T.SphereGeometry(1, 64, 40),
    surfaceMap(world.atlas, world.atmosphere, index === 0));
  axis.add(surface);
  const air = new T.Mesh(new T.SphereGeometry(index === 2 ? 1.012 : 1.021, 48, 30), atmosphere(world.atmosphere));
  air.renderOrder = 2;
  axis.add(air);
  let clouds;
  if (index === 1) {
    clouds = new T.Mesh(new T.SphereGeometry(1.009, 56, 32), cloudLayer('#f7f9ef'));
    clouds.renderOrder = 1;
    axis.add(clouds);
  }
  if (index === 0) {
    const ring = new T.Mesh(new T.RingGeometry(1.26, 1.96, 128), ringDisk());
    ring.rotation.x = Math.PI * .5;
    ring.renderOrder = 3;
    axis.add(ring);
  }
  const companion = new T.Mesh(new T.SphereGeometry(world.moon, 24, 14),
    surfaceMap('oriole', '#938d88', false, true));
  root.add(companion);
  root.userData.orbit = { surface, clouds, companion, world };
  animatePlanet(root, 0);
  return root;
}

export function animatePlanet(root, seconds) {
  const { surface, clouds, companion, world } = root.userData.orbit;
  surface.rotation.y = world.phase + seconds * world.spin;
  if (clouds) clouds.rotation.y = -.75 + seconds * .031;
  const phase = world.phase + seconds * .040;
  companion.position.set(Math.cos(phase)*2.13, .52*Math.sin(phase)+.14, Math.sin(phase)*1.73);
  companion.rotation.y = phase * .9;
}
