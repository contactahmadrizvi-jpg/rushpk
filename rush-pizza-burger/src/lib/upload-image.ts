export async function uploadToImgBB(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch("/api/imgbb", { method: "POST", body: formData });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Image upload failed");
  }

  const url = (data.url as string | undefined)?.trim();
  if (!url) {
    throw new Error("No image URL returned from ImgBB");
  }

  // Must be a direct image host, not the ibb.co page link
  if (url.includes("ibb.co/") && !url.includes("i.ibb.co")) {
    throw new Error("Invalid image URL — please upload again");
  }

  return url;
}
