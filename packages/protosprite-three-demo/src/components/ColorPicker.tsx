import { Popover } from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { ChromePicker, RGBColor } from "react-color";
import { Color } from "three";

import "./ColorPicker.css";

type ColorPickerProps = {
  color: number;
  alpha?: number;
  onChange?: (newValue: number, newAlpha: number) => void;
};

export function ColorPicker(props: ColorPickerProps) {
  const { color, alpha, onChange } = props;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const onSwitchClicked = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      setAnchorEl(e.currentTarget);
      setIsOpen(true);
    },
    []
  );

  const currentColor = useMemo<RGBColor>(() => {
    const threeColor = new Color(color);
    return {
      r: Math.floor(threeColor.r * 255),
      g: Math.floor(threeColor.g * 255),
      b: Math.floor(threeColor.b * 255),
      a: alpha
    };
  }, [color, alpha]);

  return (
    <>
      <div
        className="color-swatch"
        onClick={onSwitchClicked}
        style={{
          backgroundColor: `#${new Color(currentColor.r / 255, currentColor.g / 255, currentColor.b / 255).getHexString()}`
        }}
      />
      <Popover
        anchorEl={anchorEl}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center"
        }}
      >
        <div className="color-picker">
          <ChromePicker
            color={currentColor}
            onChange={(value) =>
              onChange?.(new Color(value.rgb.r / 255, value.rgb.g / 255, value.rgb.b / 255).getHex(), value.rgb.a ?? 1)
            }
          />
        </div>
      </Popover>
    </>
  );
}
