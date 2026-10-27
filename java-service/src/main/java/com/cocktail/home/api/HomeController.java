package com.cocktail.home.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.cocktail.home.api.HomeDtos.QuickEntriesResponse;
import com.cocktail.home.domain.HomeCatalog;
import com.cocktail.shared.web.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "首页")
@RestController
@RequestMapping("/api/cocktail/home")
public class HomeController {

    @Operation(summary = "首页快捷入口（含图标 URL）")
    @GetMapping("/quick-entries")
    public ApiResponse<QuickEntriesResponse> quickEntries() {
        return ApiResponse.ok(new QuickEntriesResponse(HomeCatalog.quickEntries()));
    }
}
