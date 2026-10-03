import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class BranchResponseDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isPrimary: boolean;

  @ApiProperty({ format: "date-time" })
  createdAt: string;

  @ApiProperty({ format: "date-time" })
  updatedAt: string;
}
