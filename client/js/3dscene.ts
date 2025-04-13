import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// Import the model directly so Vite processes it as an asset
import eliseModelUrl from '../assets/elise.glb?url';
import * as ui from './ui.ts';

// Scene elements
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let model: THREE.Group;
let mixer: THREE.AnimationMixer;
let controls: OrbitControls;
let clock = new THREE.Clock();
let cameraInfoElement: HTMLElement | null = null;

/**
 * Initialize the 3D scene
 */
export function initScene(canvasElement: HTMLCanvasElement): void {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2f3136);

  // Create camera
  camera = new THREE.PerspectiveCamera(
    45, 
    canvasElement.clientWidth / canvasElement.clientHeight, 
    0.1, 
    10000
  );
  camera.position.set(629.25, 667.37, 705.57);
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ 
    canvas: canvasElement,
    antialias: true
  });
  renderer.setSize(canvasElement.clientWidth, canvasElement.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  
  // Add orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.00, 1.50, 0.00);
  controls.update();
  
  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 10, 7.5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Create camera info display
  createCameraInfoDisplay(canvasElement);

  // Load model
  loadModel();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Start animation loop
  animate();
}

/**
 * Create camera info display element
 */
function createCameraInfoDisplay(canvasElement: HTMLCanvasElement): void {
  // Create the info element
  cameraInfoElement = document.createElement('div');
  cameraInfoElement.id = 'camera-info';
  cameraInfoElement.style.position = 'absolute';
  cameraInfoElement.style.top = '10px';
  cameraInfoElement.style.left = '10px';
  cameraInfoElement.style.padding = '8px';
  cameraInfoElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  cameraInfoElement.style.color = 'white';
  cameraInfoElement.style.fontFamily = 'monospace';
  cameraInfoElement.style.fontSize = '12px';
  cameraInfoElement.style.borderRadius = '4px';
  cameraInfoElement.style.zIndex = '100';
  cameraInfoElement.style.pointerEvents = 'none'; // Don't interfere with controls
  
  // Add it to the parent of the canvas
  const canvasContainer = canvasElement.parentElement;
  if (canvasContainer) {
    canvasContainer.style.position = 'relative';
    canvasContainer.appendChild(cameraInfoElement);
  }
}

/**
 * Update camera info display
 */
function updateCameraInfo(): void {
  if (!cameraInfoElement) return;
  
  // Format position to 2 decimal places
  const px = camera.position.x.toFixed(2);
  const py = camera.position.y.toFixed(2);
  const pz = camera.position.z.toFixed(2);
  
  // Format target to 2 decimal places
  const tx = controls.target.x.toFixed(2);
  const ty = controls.target.y.toFixed(2);
  const tz = controls.target.z.toFixed(2);
  
  // Update the display
  cameraInfoElement.innerHTML = `
    Camera Position: [${px}, ${py}, ${pz}]<br>
    Look Target: [${tx}, ${ty}, ${tz}]
  `;
}

/**
 * Load the GLB model
 */
function loadModel(): void {
  // Extract the filename without path
  const filename = eliseModelUrl.split('/').pop() || 'elise.glb';
  ui.displaySystemMessage(`Original import URL: ${eliseModelUrl}`);
  
  // Create a list of possible paths to try
  const pathsToTry = [
    eliseModelUrl,                      // Original import URL
    `./assets/${filename}`,             // Relative to current directory
    `../assets/${filename}`,            // Up one directory
    `assets/${filename}`,               // From root
    `/assets/${filename}`,              // Absolute from domain root
    `./assets/elise.glb`,               // Fixed filename relative
    `/assets/elise.glb`,                // Fixed filename absolute
    `${window.location.origin}/assets/${filename}`, // Origin-based URL
    filename                            // Just the filename
  ];
  
  // Try loading sequentially
  tryNextPath(pathsToTry, 0);
}

/**
 * Try loading from each path until one works
 */
function tryNextPath(paths: string[], index: number): void {
  if (index >= paths.length) {
    ui.displaySystemMessage(`All loading attempts failed. Model could not be loaded.`);
    return;
  }
  
  const path = paths[index];
  ui.displaySystemMessage(`Attempt ${index+1}/${paths.length}: Loading from "${path}"`);
  
  const loader = new GLTFLoader();
  loader.load(
    path,
    // Success handler
    (gltf) => {
      ui.displaySystemMessage(`SUCCESS: Model loaded from "${path}"`);
      model = gltf.scene;
      scene.add(model);
      
      // Center model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x = -center.x;
      model.position.z = -center.z;
      
      // Adjust model position if needed
      model.position.y = 0;
      
      // Setup animations
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        // Play the first animation by default
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
        ui.displaySystemMessage(`Started animation: ${gltf.animations.length} animations found`);
      } else {
        ui.displaySystemMessage(`No animations found in model`);
      }
    },
    // Progress handler (simplified to reduce message spam)
    (xhr) => {
      if (xhr.loaded / xhr.total === 1) {
        ui.displaySystemMessage(`Loading completed for "${path}"`);
      }
    },
    // Error handler
    (error: any) => {
      ui.displaySystemMessage(`Failed: "${path}" - ${error.message || 'Unknown error'}`);
      // Try next path
      tryNextPath(paths, index + 1);
    }
  );
}

/**
 * Handle window resize
 */
function onWindowResize(): void {
  const canvas = renderer.domElement;
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}

/**
 * Animation loop
 */
function animate(): void {
  requestAnimationFrame(animate);
  
  // Update animation mixer
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  
  // Update controls
  controls.update();
  
  // Update camera info display
  updateCameraInfo();
  
  // Render scene
  renderer.render(scene, camera);
}

/**
 * Resize the renderer to match the canvas size
 */
export function resizeRenderer(): void {
  if (!renderer) return;
  
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
} 