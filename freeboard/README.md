# Freeboard

Freeboard is a first-person space game for the Axiko Games hub and standalone browsers. A new captain starts at the aft airlock. The port terminal is within reach, the crew quarters open to the left, and the illuminated passage leads forward to the pilot seat.

## On board

Walk with **WASD**. Drag the view or use the arrow keys to turn and look up or down. On a touchscreen, use the left stick to move and swipe the view with a second finger. Use **F** or the nearby action button at the airlock for port services or at the pilot seat to take the helm.

From the seat, open the contract selector, pick a destination and undock. Steer with the mouse, arrow keys or virtual stick. **W** adds thrust, **S** brakes, **Shift** boosts and **Space** fires a pulse. **E** points the bow at the current objective. On touchscreens the flight controls sit beside the view. **Escape** opens the menu.

Leave the seat with **F** or **Leave the seat**. The ship holds position while you walk. Return to the chair to resume piloting. Progress and your place aboard are saved. An active flight resumes paused.

## Making a living

Trade between Vesper, Pelagos and Oriole or take an insured freight, patrol or survey contract. The terminal quotes the expected profit before launch. On surveys, reach the landing beacon, walk up to three crystals and hold **Space** or **Sample** by each one. Return to the landed ship and board it.

Buy hulls, fit up to two modules, train pilot skills and hire crew. Extra berths accommodate specialists in the living quarters. The interior controls change the room finish and move the magnetic display mount. After collecting your first sample it displays a mineral from the expedition.

## Running the game

The Axiko hub opens `ui/index.html`. For standalone play, serve the package over HTTP and open `ui/play.html`. Standalone progress is saved in the browser. Three.js r160 and its MIT license are bundled in `vendor/three-0.160.0`. A perspective Canvas renderer supports walking and cockpit flight on devices without WebGL. The game uses local meshes, maps, textures and ship renders.
