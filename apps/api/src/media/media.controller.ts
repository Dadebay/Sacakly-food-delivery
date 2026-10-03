import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { AdminPages, Public, Roles } from "../common/auth.decorators";
import { AdminPage, Role } from "../generated/prisma/client";
import { MediaService } from "./media.service";
import { MediaUploadResponseDto } from "./media.dto";

@ApiTags("media")
@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("images")
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @AdminPages(AdminPage.CATALOG, AdminPage.MARKETING, AdminPage.ORDERS)
  @ApiConsumes("multipart/form-data")
  @ApiCreatedResponse({ type: MediaUploadResponseDto })
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5_242_880, files: 1 },
      fileFilter: (_request, file, callback) => {
        callback(
          file.mimetype.startsWith("image/")
            ? null
            : new BadRequestException("Only images are accepted"),
          file.mimetype.startsWith("image/"),
        );
      },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Image file is required");
    return this.media.uploadImage(file);
  }

  @Get(":filename")
  @Public()
  async read(
    @Param("filename") filename: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const image = await this.media.readImage(filename);
    response.setHeader("Content-Type", image.contentType);
    response.setHeader("Cache-Control", image.cacheControl);
    if (image.contentLength !== undefined) {
      response.setHeader("Content-Length", image.contentLength);
    }
    return new StreamableFile(image.body);
  }

  @Delete("images/:filename")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @AdminPages(AdminPage.CATALOG, AdminPage.MARKETING)
  async remove(@Param("filename") filename: string) {
    await this.media.deleteImage(filename);
  }
}
