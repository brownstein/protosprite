import {
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Popover,
  Select,
  Slider,
  Tab,
  Tabs,
  ThemeProvider,
  Typography,
  createTheme
} from "@mui/material";
import binPack from "bin-pack";
import { ProtoSpriteSheet } from "protosprite-core";
import {
  ProtoSpriteGeometry,
  SpriteGeometryEntryData
} from "protosprite-geom";
import {
  ProtoSpriteSheetThree,
  ProtoSpriteSheetThreeLoader,
  ProtoSpriteThree,
  ProtoSpriteThreeExtended,
  SliceRegion
} from "protosprite-three";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box3, Color, Scene, Vector2 } from "three";

import "./App.css";
import birdPrsg from "./bird.prsg";
import birdSprite from "./bird.prs";
import { ColorPicker } from "./components/ColorPicker";
import { Converter } from "./components/Converter";
import { DebugTab } from "./components/Debug";
import { GeometryOverlay } from "./components/GeometryOverlay";
import { Renderer } from "./components/Renderer";

const theme = createTheme({
  palette: {
    mode: "dark"
  }
});

/**
 * Builds a classic 9-slice grid of SliceRegions. The source image (sw x sh) is
 * carved into a 3x3 grid with a fixed border `inset`; the four corners keep
 * their native size while the edges and center stretch to fill an `ow` x `oh`
 * output box. Output coordinates are centered on the origin.
 */
function build9SliceRegions(
  sw: number,
  sh: number,
  inset: number,
  ow: number,
  oh: number
): SliceRegion<string>[] {
  const ix = Math.max(0, Math.min(inset, Math.floor(sw / 2)));
  const iy = Math.max(0, Math.min(inset, Math.floor(sh / 2)));
  // Breakpoints along each axis for source and output rects.
  const sx = [0, ix, sw - ix, sw];
  const sy = [0, iy, sh - iy, sh];
  const ox = [0, ix, ow - ix, ow];
  const oy = [0, iy, oh - iy, oh];
  const regions: SliceRegion<string>[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const srcW = sx[c + 1] - sx[c];
      const srcH = sy[r + 1] - sy[r];
      if (srcW <= 0 || srcH <= 0) continue;
      regions.push({
        id: `r${r}c${c}`,
        srcPos: new Vector2(sx[c], sy[r]),
        srcSize: new Vector2(srcW, srcH),
        outPos: new Vector2(ox[c] - ow / 2, oy[r] - oh / 2),
        outSize: new Vector2(ox[c + 1] - ox[c], oy[r + 1] - oy[r])
      });
    }
  }
  return regions;
}

function App() {
  const scene = useMemo(() => new Scene(), []);
  const loader = useMemo(() => new ProtoSpriteSheetThreeLoader(), []);

  const [sheet, setSheet] = useState<ProtoSpriteSheetThree | null>(null);
  const [sprites, setSprites] = useState<ProtoSpriteThree[]>([]);

  const [currentAnimation, setCurrentAnimation] = useState("Fly");
  const [currentPlaybackSpeed, setCurrentPlaybackSpeed] = useState(1);
  const [currentOpacity, setCurrentOpacity] = useState(1);
  const [currentOutlineEnabled, setCurrentOutlineEnabled] = useState(false);
  const [currentOutlineColor, setCurrentOutlineColor] = useState(0);
  const [currentOutlineOpacity, setCurrentOutlineOpacity] = useState(1);
  const [currentMultColor, setCurrentMultColor] = useState(0xffffff);
  const [currentMultOpacity, setCurrentMultOpacity] = useState(0);
  const [currentFadeColor, setCurrentFadeColor] = useState(0xffffff);
  const [currentFadeOpacity, setCurrentFadeOpacity] = useState(0);
  const [currentSpriteCount, setCurrentSpriteCount] = useState(1);
  const [currentHiddenLayers, setCurrentHiddenLayers] = useState<
    Set<string> | undefined
  >();

  const [geometryData, setGeometryData] = useState<
    SpriteGeometryEntryData[] | null
  >(null);
  const [showGeometry, setShowGeometry] = useState(false);
  const overlaysRef = useRef<GeometryOverlay[]>([]);

  // 9-slice (ProtoSpriteThreeExtended) mode state.
  const [extendedSprite, setExtendedSprite] = useState<ProtoSpriteThreeExtended<
    string,
    string,
    string
  > | null>(null);
  const [sliceTargetWidth, setSliceTargetWidth] = useState(256);
  const [sliceTargetHeight, setSliceTargetHeight] = useState(256);
  const [sliceInset, setSliceInset] = useState(10);
  const [sliceFillMode, setSliceFillMode] = useState<"stretch" | "repeat">(
    "stretch"
  );

  const [currentTab, setCurrentTab] = useState("about");

  const iState = useMemo(
    () => ({
      currentAnimation: "Fly",
      currentPlaybackSpeed: 1,
      currentOpacity: 1,
      currentOutlineEnabled: true,
      currentOutlineColor: 0,
      currentOutlineOpacity: 1,
      currentMultColor: 0xffffff,
      currentMultOpacity: 0,
      currentFadeColor: 0xffffff,
      currentFadeOpacity: 0,
      currentSpriteCount,
      currentHiddenLayers: undefined as Set<string> | undefined
    }),
    [currentSpriteCount]
  );
  iState.currentAnimation = currentAnimation;
  iState.currentPlaybackSpeed = currentPlaybackSpeed;
  iState.currentOpacity = currentOpacity;
  iState.currentOutlineEnabled = currentOutlineEnabled;
  iState.currentOutlineColor = currentOutlineColor;
  iState.currentOutlineOpacity = currentOutlineOpacity;
  iState.currentMultColor = currentMultColor;
  iState.currentMultOpacity = currentMultOpacity;
  iState.currentFadeColor = currentFadeColor;
  iState.currentFadeOpacity = currentFadeOpacity;
  iState.currentSpriteCount = currentSpriteCount;
  iState.currentHiddenLayers = currentHiddenLayers;

  useEffect(() => {
    loader.loadAsync(birdSprite).then(setSheet);
  }, [loader]);

  useEffect(() => {
    fetch(birdPrsg)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        const geom = ProtoSpriteGeometry.fromArray(new Uint8Array(buf));
        setGeometryData(geom.data.entries);
      });
  }, []);

  useEffect(() => {
    if (!sheet) return;
    type Bounds = {
      spriteThree: ProtoSpriteThree;
      width: number;
      height: number;
    };
    const toPack: Bounds[] = [];

    if (sheet.sheet.sprites.length >= iState.currentSpriteCount) {
      for (
        let spriteIndex = 0;
        spriteIndex < sheet.sheet.sprites.length;
        spriteIndex++
      ) {
        const spriteThree = sheet.getSprite(spriteIndex);
        spriteThree.gotoAnimation(iState.currentAnimation);
        spriteThree.center();
        spriteThree.mesh.scale.y = -1;
        const bbox = new Box3()
          .expandByObject(spriteThree.mesh)
          .expandByScalar(2);
        const bounds: Bounds = {
          width: bbox.max.x - bbox.min.x,
          height: bbox.max.y - bbox.min.y,
          spriteThree
        };
        toPack.push(bounds);
      }
    } else {
      for (let i = 0; i < iState.currentSpriteCount; i++) {
        const spriteThree = sheet.getSprite(i % sheet.sheet.sprites.length);
        spriteThree.gotoAnimation(iState.currentAnimation);
        spriteThree.center();
        spriteThree.mesh.scale.y = -1;
        const bbox = new Box3()
          .expandByObject(spriteThree.mesh)
          .expandByScalar(2);
        const bounds: Bounds = {
          width: bbox.max.x - bbox.min.x,
          height: bbox.max.y - bbox.min.y,
          spriteThree
        };
        toPack.push(bounds);
      }
    }

    const packed = binPack(toPack);

    const sprites: ProtoSpriteThree[] = [];
    for (const packedBin of packed.items) {
      const spriteThree = packedBin.item.spriteThree;
      spriteThree.mesh.position.x =
        packedBin.x + packedBin.width * 0.5 - packed.width * 0.5;
      spriteThree.mesh.position.y =
        packedBin.y + packedBin.width * 0.5 - packed.height * 0.5;

      if (iState.currentOpacity !== 1)
        spriteThree.setOpacity(iState.currentOpacity);
      if (iState.currentOutlineEnabled)
        spriteThree.outlineAllLayers(
          1,
          new Color(iState.currentOutlineColor),
          iState.currentOutlineOpacity
        );
      if (iState.currentFadeColor || iState.currentFadeOpacity) {
        spriteThree.fadeAllLayers(
          new Color(iState.currentFadeColor),
          iState.currentFadeOpacity
        );
      }
      if (iState.currentMultColor || iState.currentMultOpacity) {
        spriteThree.multiplyAllLayers(
          new Color(iState.currentMultColor),
          iState.currentMultOpacity
        );
      }
      spriteThree.data.animationState.speed = iState.currentPlaybackSpeed;
      if (iState.currentHiddenLayers)
        spriteThree.hideLayers(...iState.currentHiddenLayers.values());

      sprites.push(spriteThree);
    }

    setSprites(sprites);
  }, [sheet, iState]);

  useEffect(() => {
    scene.clear();
    if (currentTab === "nine-slice") {
      if (extendedSprite) scene.add(extendedSprite.mesh);
    } else {
      for (const sprite of sprites) scene.add(sprite.mesh);
      // Re-add overlay meshes if active
      for (const overlay of overlaysRef.current) {
        scene.add(overlay.linesMesh);
      }
    }
  }, [scene, sprites, extendedSprite, currentTab]);

  // Dispose the regular sprites whenever they are replaced.
  useEffect(() => {
    return () => {
      for (const sprite of sprites) sprite.dispose();
    };
  }, [sprites]);

  // Build the extended (9-slice) sprite when the 9-Slice tab is active.
  useEffect(() => {
    if (!sheet || currentTab !== "nine-slice") {
      setExtendedSprite(null);
      return;
    }
    const sprite = sheet.getSpriteExtended<string, string, string>();
    sprite.gotoAnimation(currentAnimation);
    sprite.data.animationState.speed = currentPlaybackSpeed;
    sprite.mesh.scale.y = -1;
    setExtendedSprite(sprite);
    return () => {
      sprite.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, currentTab]);

  // Rebuild the 9-slice regions whenever the target box, inset, or fill mode
  // changes. We first establish a clean 9-slice source template (only the
  // source rects matter here), then let autoUpdateRegions recompute the output
  // layout to fit the target box - stretching or tiling the interior bands.
  useEffect(() => {
    if (!extendedSprite) return;
    const { x: sw, y: sh } = extendedSprite.size;
    extendedSprite.setRegions(build9SliceRegions(sw, sh, sliceInset, sw, sh));
    extendedSprite.autoUpdateRegions(
      sliceTargetWidth,
      sliceTargetHeight,
      sliceFillMode
    );
  }, [
    extendedSprite,
    sliceInset,
    sliceTargetWidth,
    sliceTargetHeight,
    sliceFillMode
  ]);

  useEffect(() => {
    // Clean up previous overlays
    for (const overlay of overlaysRef.current) {
      scene.remove(overlay.linesMesh);
      overlay.dispose();
    }
    overlaysRef.current = [];

    if (!showGeometry || !geometryData || sprites.length === 0) return;

    const newOverlays: GeometryOverlay[] = [];
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i];
      const entry = geometryData[i % geometryData.length];
      if (!entry) continue;
      const overlay = new GeometryOverlay(sprite, entry);
      overlay.syncPosition();
      scene.add(overlay.linesMesh);
      newOverlays.push(overlay);
    }
    overlaysRef.current = newOverlays;

    return () => {
      for (const overlay of newOverlays) {
        scene.remove(overlay.linesMesh);
        overlay.dispose();
      }
      overlaysRef.current = [];
    };
  }, [scene, sprites, showGeometry, geometryData]);

  const animationList = useMemo<string[]>(() => {
    if (!sheet) return [];
    const animationSet = new Set<string>();
    for (const sprite of sheet.sheet.sprites) {
      for (const animation of sprite.data.animations) {
        animationSet.add(animation.name);
      }
    }
    const animations = [...animationSet.values()];
    animations.sort((a, b) => a.localeCompare(b));
    return animations;
  }, [sheet]);

  const layersList = useMemo<string[]>(() => {
    if (!sheet) return [];
    const layerSet = new Set<string>();
    for (const sprite of sheet.sheet.sprites) {
      for (const layer of sprite.data.layers) {
        layerSet.add(layer.name);
      }
    }
    const layers = [...layerSet.values()];
    layers.sort((a, b) => a.localeCompare(b));
    return layers;
  }, [sheet]);

  const [layersListOpen, setLayersListOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <ThemeProvider theme={theme}>
      <div className="App">
        <header className="App-header">
          <Renderer
            scene={scene}
            onBeforeRender={(delta) => {
              if (currentTab === "nine-slice") {
                extendedSprite?.advance(delta);
                return;
              }
              for (const sprite of sprites) {
                sprite.advance(delta);
              }
              for (const overlay of overlaysRef.current) {
                overlay.syncPosition();
              }
            }}
          />
          <div className="main">
            <Tabs
              value={currentTab}
              onChange={(_e, value) => setCurrentTab(value)}
            >
              <Tab label="About" value="about" />
              <Tab label="Sprite Playground" value="rendering" />
              <Tab label="9-Slice" value="nine-slice" />
              <Tab label="Import" value="import" />
              <Tab label="Debug" value="debug" />
            </Tabs>
            {currentTab === "about" && (
              <div className="about">
                <h1>protosprite</h1>
                <p className="explanation">
                  A protobuf based binary encoding format for sprite sheets.
                  This can yield significant performance gains over JSON based
                  encodings that feature repeated strings.
                </p>
                <h3>Packages</h3>
                <ul className="subpackages">
                  <li>
                    <a
                      className="package-name"
                      href="https://github.com/brownstein/protosprite/tree/main/packages/protosprite-core"
                    >
                      protosprite-core
                    </a>{" "}
                    is the core implementation.
                  </li>
                  <li>
                    <a
                      className="package-name"
                      href="https://github.com/brownstein/protosprite/tree/main/packages/protosprite-three"
                    >
                      protosprite-three
                    </a>{" "}
                    is a Three.js renderer for protosprite.
                  </li>
                  <li>
                    <a
                      className="package-name"
                      href="https://github.com/brownstein/protosprite/tree/main/packages/protosprite-cli"
                    >
                      protosprite-cli
                    </a>{" "}
                    is a command line tool for working with protosprite.
                  </li>
                </ul>
              </div>
            )}
            {currentTab === "rendering" && (
              <div>
                <h3>Here are some rendering parameters to play with.</h3>
                <div className="params">
                  <div className="param odd">
                    <Typography>Animation</Typography>
                    <Select
                      value={currentAnimation}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCurrentAnimation(value);
                        for (const sprite of sprites)
                          sprite.gotoAnimation(value);
                      }}
                    >
                      {animationList.map((animationName) => (
                        <MenuItem key={animationName} value={animationName}>
                          {animationName}
                        </MenuItem>
                      ))}
                    </Select>
                  </div>
                  <div className="param">
                    <Typography>Playback Speed</Typography>
                    <Slider
                      min={-2}
                      max={2}
                      step={0.1}
                      value={currentPlaybackSpeed}
                      onChange={(e, value) => {
                        setCurrentPlaybackSpeed(value);
                        for (const sprite of sprites)
                          sprite.data.animationState.speed = value;
                      }}
                    />
                  </div>
                  <div className="param odd">
                    <Typography>Opacity</Typography>
                    <Slider
                      min={0}
                      max={1}
                      step={0.1}
                      value={currentOpacity}
                      onChange={(e, value) => {
                        setCurrentOpacity(value);
                        for (const sprite of sprites) sprite.setOpacity(value);
                      }}
                    />
                  </div>
                  <div className="param param-row">
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={currentOutlineEnabled}
                          onChange={(e) => {
                            setCurrentOutlineEnabled(e.target.checked);
                            for (const sprite of sprites)
                              sprite.outlineAllLayers(
                                1,
                                new Color(0),
                                e.target.checked ? 1 : 0
                              );
                          }}
                          sx={{
                            color: currentOutlineEnabled
                              ? `#${new Color(currentOutlineColor).getHexString()}`
                              : undefined,
                            "&.Mui-checked": {
                              color: currentOutlineEnabled
                                ? `#${new Color(currentOutlineColor).getHexString()}`
                                : undefined
                            }
                          }}
                        />
                      }
                      label="Outline"
                    />
                    {currentOutlineEnabled && (
                      <ColorPicker
                        color={currentOutlineColor}
                        alpha={currentOutlineOpacity}
                        onChange={(c, a) => {
                          setCurrentOutlineColor(c);
                          setCurrentOutlineOpacity(a);
                          const value = new Color(c);
                          for (const sprite of sprites)
                            sprite.outlineAllLayers(1, value, a);
                        }}
                      />
                    )}
                  </div>
                  <div className="param odd">
                    <Typography>Multiply Color</Typography>
                    <ColorPicker
                      color={currentMultColor}
                      alpha={currentMultOpacity}
                      onChange={(c, a) => {
                        setCurrentMultColor(c);
                        setCurrentMultOpacity(a);
                        const value = new Color(c);
                        for (const sprite of sprites)
                          sprite.multiplyAllLayers(value, a);
                      }}
                    />
                  </div>
                  <div className="param">
                    <Typography>Fade Color</Typography>
                    <ColorPicker
                      color={currentFadeColor}
                      alpha={currentFadeOpacity}
                      onChange={(c, a) => {
                        setCurrentFadeColor(c);
                        setCurrentFadeOpacity(a);
                        const value = new Color(c);
                        for (const sprite of sprites)
                          sprite.fadeAllLayers(value, a);
                      }}
                    />
                  </div>
                  <div className="param odd">
                    <Typography>Sprite Count</Typography>
                    <Slider
                      min={1}
                      max={1000}
                      step={1}
                      value={currentSpriteCount}
                      onChange={(_e, value) => {
                        setCurrentSpriteCount(value);
                      }}
                    />
                  </div>
                  <div className="param">
                    <Button
                      onClick={(e) => {
                        setAnchorEl(e.currentTarget);
                        setLayersListOpen(true);
                      }}
                    >
                      Show/Hide Layers
                    </Button>
                    <Popover
                      anchorEl={anchorEl}
                      open={layersListOpen}
                      onClose={() => setLayersListOpen(false)}
                    >
                      <div className="layers-list">
                        <Typography>Layers</Typography>
                        {layersList.map((layerName) => (
                          <div key={layerName}>
                            <FormControlLabel
                              label={layerName}
                              control={
                                <Checkbox
                                  checked={!currentHiddenLayers?.has(layerName)}
                                  onChange={(e) => {
                                    const hiddenLayers = new Set(
                                      currentHiddenLayers
                                    );
                                    if (!e.target.checked) {
                                      hiddenLayers.add(layerName);
                                      for (const sprite of sprites) {
                                        sprite.hideLayers(layerName);
                                      }
                                    } else {
                                      hiddenLayers.delete(layerName);
                                      for (const sprite of sprites) {
                                        sprite.showLayers(layerName);
                                      }
                                    }
                                    setCurrentHiddenLayers(hiddenLayers);
                                  }}
                                />
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </Popover>
                  </div>
                  <div className="param odd">
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={showGeometry}
                          onChange={(e) => setShowGeometry(e.target.checked)}
                        />
                      }
                      label="Show Geometry Overlay"
                    />
                  </div>
                </div>
              </div>
            )}
            {currentTab === "nine-slice" && (
              <div>
                <h3>
                  Render the sprite as a warped 9-slice box (
                  ProtoSpriteThreeExtended).
                </h3>
                <p className="explanation small">
                  The sprite is carved into a 3x3 grid by a fixed border inset.
                  The corners keep their native size while the edges and center
                  stretch to fill the target box.
                </p>
                <div className="params">
                  <div className="param odd">
                    <Typography>Animation</Typography>
                    <Select
                      value={currentAnimation}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCurrentAnimation(value);
                        extendedSprite?.gotoAnimation(value);
                      }}
                    >
                      {animationList.map((animationName) => (
                        <MenuItem key={animationName} value={animationName}>
                          {animationName}
                        </MenuItem>
                      ))}
                    </Select>
                  </div>
                  <div className="param">
                    <Typography>Target Width ({sliceTargetWidth}px)</Typography>
                    <Slider
                      min={8}
                      max={512}
                      step={1}
                      value={sliceTargetWidth}
                      onChange={(_e, value) =>
                        setSliceTargetWidth(value as number)
                      }
                    />
                  </div>
                  <div className="param odd">
                    <Typography>
                      Target Height ({sliceTargetHeight}px)
                    </Typography>
                    <Slider
                      min={8}
                      max={512}
                      step={1}
                      value={sliceTargetHeight}
                      onChange={(_e, value) =>
                        setSliceTargetHeight(value as number)
                      }
                    />
                  </div>
                  <div className="param">
                    <Typography>Border Inset ({sliceInset}px)</Typography>
                    <Slider
                      min={0}
                      max={64}
                      step={1}
                      value={sliceInset}
                      onChange={(_e, value) => setSliceInset(value as number)}
                    />
                  </div>
                  <div className="param odd">
                    <Typography>Fill Mode</Typography>
                    <Select
                      value={sliceFillMode}
                      onChange={(e) =>
                        setSliceFillMode(
                          e.target.value as "stretch" | "repeat"
                        )
                      }
                    >
                      <MenuItem value="stretch">stretch</MenuItem>
                      <MenuItem value="repeat">repeat</MenuItem>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            {currentTab === "import" && (
              <div>
                <h3>
                  Preview your own files (Aseprite exports or ProtoSprite)
                </h3>
                <Converter
                  onPreviewSprite={async (sheet) => {
                    const spriteSheet = new ProtoSpriteSheet(sheet);
                    const spriteSheetThree =
                      await loader.loadAsync(spriteSheet);
                    setGeometryData(null);
                    setSheet(spriteSheetThree);
                  }}
                />
              </div>
            )}
            {currentTab === "debug" && <DebugTab sprite={sprites.at(0)} />}
          </div>
        </header>
      </div>
    </ThemeProvider>
  );
}

export default App;
