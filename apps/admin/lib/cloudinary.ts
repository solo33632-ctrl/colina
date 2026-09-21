import { v2 as cloudinary } from 'cloudinary';

// Cloudinary server-side upload helper (admin only — never import this
// module from client code). Uses the official Node.js SDK (v2 API, the
// security-hardened June 2025+ release line) and its `upload_stream`
// method, which is the documented way to push a file received in a
// Next.js Server Action up to Cloudinary without touching disk.

export type CloudinaryResourceType = 'image' | 'raw';

type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function readCredentials(): CloudinaryCredentials | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }
  return { cloudName, apiKey, apiSecret };
}

// Returns the configured credentials, or null when any of the three env
// vars is missing. Callers must surface that as a clear "not configured"
// error instead of silently failing. The SDK singleton is (re)configured
// on each read — env vars are fixed per deployment, and re-applying the
// three values is cheap and keeps behavior obvious.
export function cloudinaryCredentials(): CloudinaryCredentials | null {
  const credentials = readCredentials();
  if (credentials) {
    cloudinary.config({
      cloud_name: credentials.cloudName,
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret,
    });
  }
  return credentials;
}

export type UploadBufferOptions = {
  resourceType: CloudinaryResourceType;
  folder: string;
};

export type UploadBufferResult = {
  secureUrl: string;
  publicId: string;
};

// Streams a file buffer to Cloudinary and resolves with the delivered
// asset's secure URL. Callers validate type/size BEFORE calling this.
export function uploadBuffer(
  buffer: Buffer,
  options: UploadBufferOptions
): Promise<UploadBufferResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: options.resourceType,
        folder: options.folder,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result || typeof result.secure_url !== 'string') {
          reject(new Error('Cloudinary upload returned no secure_url.'));
          return;
        }
        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id ?? '',
        });
      }
    );
    stream.end(buffer);
  });
}
