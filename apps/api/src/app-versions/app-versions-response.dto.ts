import { ApiProperty } from "@nestjs/swagger";
import { PushDevicePlatform } from "../generated/prisma/client";

export class PublicAppVersionResponseDto {
  @ApiProperty({ example: "1.4.0" })
  latestVersion!: string;

  @ApiProperty({ example: "1.2.0" })
  minSupportedVersion!: string;

  @ApiProperty({
    example:
      "https://play.google.com/store/apps/details?id=com.gurbanov.alowalow",
  })
  storeUrl!: string;

  @ApiProperty({ type: String, nullable: true })
  releaseNotesRu!: string | null;

  @ApiProperty({ type: String, nullable: true })
  releaseNotesTk!: string | null;
}

export class AdminAppVersionResponseDto extends PublicAppVersionResponseDto {
  @ApiProperty({ enum: PushDevicePlatform })
  platform!: PushDevicePlatform;

  @ApiProperty({ type: "integer", minimum: 1 })
  version!: number;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}
