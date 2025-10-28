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
  ProtoSpriteSheetThree,
  ProtoSpriteSheetThreeLoader,
  ProtoSpriteThree
} from "protosprite-three";
import { useEffect, useMemo, useState } from "react";
import { Box3, Color, Scene } from "three";

import "./App.css";
import birdSprite from "./bird.prs";
import { ColorPicker } from "./components/ColorPicker";
import { Converter } from "./components/Converter";
import { DebugTab } from "./components/Debug";
import { Renderer } from "./components/Renderer";

const theme = createTheme({
  palette: {
    mode: "dark"
  }
});

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
    for (const sprite of sprites) scene.add(sprite.mesh);
    return () => {
      for (const sprite of sprites) sprite.dispose();
    };
  }, [scene, sprites]);

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

  const [currentTab, setCurrentTab] = useState("about");
  const [layersListOpen, setLayersListOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <ThemeProvider theme={theme}>
      <div className="App">
        <header className="App-header">
          <Renderer
            scene={scene}
            onBeforeRender={(delta) => {
              for (const sprite of sprites) {
                sprite.advance(delta);
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
