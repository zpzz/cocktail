package com.cocktail.cabinet.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cocktail.cabinet.domain.CabinetItem;

/** cabinet_item 表访问。 */
@Mapper
public interface CabinetItemMapper extends BaseMapper<CabinetItem> {
}
