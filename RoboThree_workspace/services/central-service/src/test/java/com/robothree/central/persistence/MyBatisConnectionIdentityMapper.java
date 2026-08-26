package com.robothree.central.persistence;

import org.apache.ibatis.annotations.Select;

interface MyBatisConnectionIdentityMapper {

    @Select("SELECT pg_backend_pid()")
    int currentBackendPid();
}
