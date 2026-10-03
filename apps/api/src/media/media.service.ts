import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { AppEnv } from "../config/env";

const IMAGE_FILENAME = /^[0-9a-f-]{36}\.webp$/i;
const CACHE_CONTROL = "public, max-age=31536000, immutable";

@Injectable()
export class MediaService {
  private readonly bucket: string;
  private readonly s3: S3Client;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.bucket = this.config.get("S3_BUCKET", { infer: true });
    const endpoint = this.config.get("S3_ENDPOINT", { infer: true });
    const accessKeyId = this.config.get("S3_ACCESS_KEY_ID", { infer: true });
    const secretAccessKey = this.config.get("S3_SECRET_ACCESS_KEY", {
      infer: true,
    });
    const clientConfig: S3ClientConfig = {
      region: this.config.get("S3_REGION", { infer: true }),
      forcePathStyle: this.config.get("S3_FORCE_PATH_STYLE", { infer: true }),
    };

    if (endpoint) clientConfig.endpoint = endpoint;
    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }

    this.s3 = new S3Client(clientConfig);
  }

  async uploadImage(file: Express.Multer.File) {
    let body: Buffer;
    let width: number;
    let height: number;
    try {
      const transformed = await sharp(file.buffer)
        .rotate()
        .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer({ resolveWithObject: true });
      body = transformed.data;
      width = transformed.info.width;
      height = transformed.info.height;
    } catch {
      throw new BadRequestException("Image content is invalid");
    }

    const filename = `${randomUUID()}.webp`;
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key(filename),
          Body: body,
          ContentType: "image/webp",
          CacheControl: CACHE_CONTROL,
        }),
      );
    } catch {
      throw new ServiceUnavailableException("Image storage is unavailable");
    }

    return {
      filename,
      url: `/api/v1/media/${filename}`,
      contentType: "image/webp",
      width,
      height,
      bytes: body.length,
    };
  }

  async readImage(filename: string) {
    this.assertFilename(filename);

    try {
      const object = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.key(filename),
        }),
      );
      if (!object.Body) throw new NotFoundException();

      return {
        body: Buffer.from(await object.Body.transformToByteArray()),
        contentType: object.ContentType ?? "image/webp",
        cacheControl: object.CacheControl ?? CACHE_CONTROL,
        contentLength: object.ContentLength,
      };
    } catch (error) {
      if (error instanceof NotFoundException || this.isNotFound(error)) {
        throw new NotFoundException();
      }
      throw new ServiceUnavailableException("Image storage is unavailable");
    }
  }

  async deleteImage(filename: string) {
    this.assertFilename(filename);

    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.key(filename),
        }),
      );
    } catch {
      throw new ServiceUnavailableException("Image storage is unavailable");
    }
  }

  private assertFilename(filename: string) {
    if (!IMAGE_FILENAME.test(filename)) throw new NotFoundException();
  }

  private key(filename: string) {
    return `images/${filename}`;
  }

  private isNotFound(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const candidate = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      candidate.name === "NoSuchKey" ||
      candidate.name === "NotFound" ||
      candidate.$metadata?.httpStatusCode === 404
    );
  }
}
