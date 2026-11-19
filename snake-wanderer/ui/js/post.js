// Свечение ярких вещей (кристаллы, лучи, осколки). Если дополнения не загрузились — игра рисуется без него.
import * as THREE from 'three';

export async function makePost(renderer, scene, camera) {
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });   // трафарет нужен силуэту змейки
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    // Порог высокий: светится в основном то, что нарочно сделано ярче обычного (кристаллы, осколки, искры).
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.6, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return {
      composer, bloom, on: true,
      resize(w, h, pr) { composer.setPixelRatio(pr); composer.setSize(w, h); },
    };
  } catch (e) {
    console.warn('Свечение недоступно:', e && e.message ? e.message : e);
    return null;
  }
}
