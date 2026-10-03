import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../common/auth.decorators";
import {
  ReverseGeocodeQueryDto,
  ReverseGeocodeResponseDto,
  SearchGeocodeQueryDto,
  SearchGeocodeResponseDto,
} from "./geocoding.dto";
import { GeocodingService } from "./geocoding.service";

@ApiTags("geocoding")
@Controller("geocoding")
export class GeocodingController {
  constructor(private readonly geocoding: GeocodingService) {}

  @Get("reverse")
  @Public()
  @ApiOperation({
    summary:
      "Turn a map point into a short address line for the delivery-address form",
  })
  @ApiOkResponse({ type: ReverseGeocodeResponseDto })
  async reverse(
    @Query() query: ReverseGeocodeQueryDto,
  ): Promise<ReverseGeocodeResponseDto> {
    const line = await this.geocoding.reverseGeocode(query.lat, query.lon);
    return { line };
  }

  @Get("search")
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Search Turkmenistan OSM names for an authenticated delivery-address form",
  })
  @ApiOkResponse({ type: SearchGeocodeResponseDto })
  async search(
    @Query() query: SearchGeocodeQueryDto,
  ): Promise<SearchGeocodeResponseDto> {
    return {
      items: await this.geocoding.search(query.q, query.limit),
      attribution: "© OpenStreetMap contributors",
    };
  }
}
