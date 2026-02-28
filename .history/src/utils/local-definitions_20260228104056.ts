// Local keyboard definitions that are not in the official VIA keyboards repository
// These will be loaded automatically when the keyboard is connected

export const LOCAL_KEYBOARD_DEFINITIONS: Record<
  number,
  {v2: boolean; v3: boolean; name: string}
> = {
  // OS Keyboard - VID: 0x4F53, PID: 0x0002
  // vendorProductId = (0x4F53 << 16) | 0x0002 = 1330839554
  1330839554: {
    v2: true,
    v3: true,
    name: 'OS Keyboard',
  },
};

// List of local vendorProductIds to add to supported list
export const LOCAL_VENDOR_PRODUCT_IDS = Object.keys(
  LOCAL_KEYBOARD_DEFINITIONS,
).map(Number);

// Check if a keyboard is a local definition
export function isLocalKeyboard(vendorProductId: number): boolean {
  return vendorProductId in LOCAL_KEYBOARD_DEFINITIONS;
}

// Get local keyboard info
export function getLocalKeyboardInfo(vendorProductId: number) {
  return LOCAL_KEYBOARD_DEFINITIONS[vendorProductId];
}
