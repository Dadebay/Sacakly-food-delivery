import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ContactSettingsResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  telegram: string | null;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  phone: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  email: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  privacyLink: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  userAgreementLink: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
