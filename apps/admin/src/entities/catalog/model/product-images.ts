export const MAX_PRODUCT_IMAGES = 10;

export function canAddProductImages(
  storedImageCount: number,
  selectedFileCount: number,
) {
  return (
    storedImageCount >= 0 &&
    selectedFileCount >= 0 &&
    storedImageCount + selectedFileCount <= MAX_PRODUCT_IMAGES
  );
}
