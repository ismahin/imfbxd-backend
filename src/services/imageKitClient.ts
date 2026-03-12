import ImageKit from "imagekit";

const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || "";
const publicKey = process.env.IMAGEKIT_PUBLIC_KEY || "";
const privateKey = process.env.IMAGEKIT_PRIVATE_KEY || "";

if (!urlEndpoint || !publicKey || !privateKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "ImageKit is not fully configured. Set IMAGEKIT_URL_ENDPOINT, IMAGEKIT_PUBLIC_KEY, and IMAGEKIT_PRIVATE_KEY in your environment.",
  );
}

const imagekit = new ImageKit({
  urlEndpoint,
  publicKey,
  privateKey,
});

export default imagekit;

