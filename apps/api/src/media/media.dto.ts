import { ApiProperty } from "@nestjs/swagger";

export class MediaUploadResponseDto {
  @ApiProperty()
  filename: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  contentType: string;

  @ApiProperty()
  width: number;

  @ApiProperty()
  height: number;

  @ApiProperty()
  bytes: number;
}
