package com.cocktail.workbench.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cocktail.workbench.domain.WorkbenchSessionItem;

@Mapper
public interface WorkbenchSessionItemMapper extends BaseMapper<WorkbenchSessionItem> {
}
