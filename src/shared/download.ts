export function downloadText(
  filename: string,
  text: string,
  mime: string,
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  let link: HTMLAnchorElement | null = null;
  try {
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
  } finally {
    link?.remove();
    // Give the browser time to consume the download before releasing the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
