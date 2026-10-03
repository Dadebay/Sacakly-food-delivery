import { ApiProperty } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsEnum, IsInt, Min } from "class-validator";
import { AdminPage, Role } from "../generated/prisma/client";

export class UpdateAdminPageAccessDto {
  @ApiProperty({ enum: AdminPage, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(AdminPage, { each: true })
  allowedPages: AdminPage[];

  @ApiProperty({ minimum: 0, description: "Current access-policy version" })
  @IsInt()
  @Min(0)
  version: number;
}

export class AdminRolePageAccessResponseDto {
  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ enum: AdminPage, isArray: true })
  allowedPages: AdminPage[];

  @ApiProperty({ enum: AdminPage, isArray: true })
  availablePages: AdminPage[];

  @ApiProperty({
    enum: AdminPage,
    isArray: true,
    description: "Pages granted beyond the role's safe defaults",
  })
  expandedPages: AdminPage[];

  @ApiProperty()
  editable: boolean;

  @ApiProperty({ minimum: 0 })
  version: number;
}

export class AdminPageAccessMatrixResponseDto {
  @ApiProperty({ type: [AdminRolePageAccessResponseDto] })
  roles: AdminRolePageAccessResponseDto[];
}
