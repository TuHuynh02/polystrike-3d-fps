# Asset credits & licences

Every third-party asset shipped in `public/assets` is released under **CC0 1.0 (public domain dedication)**.
Attribution is not required, but is given here out of courtesy. The original licence file of the Kenney pack is kept
unchanged next to the models (`models/kenney-blaster-kit/License.txt`).

Licence text: <https://creativecommons.org/publicdomain/zero/1.0/>

## 3D models (glTF binary)

| Files | Pack | Author | Source | Licence |
|-------|------|--------|--------|---------|
| `models/kenney-blaster-kit/*.glb` (blaster-a..r, clip-large/small, crate-medium/small/wide, grenade-a/b, scope-large-a/b, scope-small, silencer-larger/small, smoke, target-*, bullet-foam*) and `Textures/colormap.png` | Blaster Kit 2.1 | Kenney (www.kenney.nl) | <https://kenney.nl/assets/blaster-kit> | CC0 1.0 |

Used in the game: `crate-wide.glb` (tactical case on top of large supply crates, Medium/High quality). The blaster models are
available behind the opt-in flag `?glbWeapons=1` (dropped weapons + lobby showcase only).

## PBR textures (1K JPG: `_diff` albedo, `_nor_gl` OpenGL normal map, `_arm` AO/Roughness/Metalness packed)

| Folder (`textures/<id>/`) | Author | Source | Licence | Used for |
|---------------------------|--------|--------|---------|----------|
| `concrete_floor_worn_001` | Dimitrios Savva & Rico Cilliers | <https://polyhaven.com/a/concrete_floor_worn_001> | CC0 1.0 | arena floors |
| `concrete_block_wall` | Charlotte Baglioni | <https://polyhaven.com/a/concrete_block_wall> | CC0 1.0 | walls, pillars |
| `rusty_metal_02` | Rob Tuytel | <https://polyhaven.com/a/rusty_metal_02> | CC0 1.0 | containers, platforms, crates |
| `metal_plate` | Rob Tuytel | <https://polyhaven.com/a/metal_plate> | CC0 1.0 | platforms, steps, containers, lab walls |
| `red_brick` | Rob Tuytel | <https://polyhaven.com/a/red_brick> | CC0 1.0 | desert outpost walls |
| `dirt_floor` | eye-candy.xyz | <https://polyhaven.com/a/dirt_floor> | CC0 1.0 | desert outpost floor |

Poly Haven (<https://polyhaven.com>) textures are CC0; see <https://polyhaven.com/license>.
Downloaded on 2026-10-16 (see `README-downloads.txt`).
