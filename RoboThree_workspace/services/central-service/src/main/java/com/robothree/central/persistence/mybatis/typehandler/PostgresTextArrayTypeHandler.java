package com.robothree.central.persistence.mybatis.typehandler;

import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;

@MappedJdbcTypes(JdbcType.ARRAY)
public final class PostgresTextArrayTypeHandler extends BaseTypeHandler<List<String>> {

    @Override
    public void setNonNullParameter(
            PreparedStatement statement,
            int index,
            List<String> parameter,
            JdbcType jdbcType)
            throws SQLException {
        Array array = statement.getConnection()
                .createArrayOf("text", parameter.toArray(String[]::new));
        statement.setArray(index, array);
    }

    @Override
    public List<String> getNullableResult(ResultSet resultSet, String columnName)
            throws SQLException {
        return read(resultSet.getArray(columnName));
    }

    @Override
    public List<String> getNullableResult(ResultSet resultSet, int columnIndex)
            throws SQLException {
        return read(resultSet.getArray(columnIndex));
    }

    @Override
    public List<String> getNullableResult(CallableStatement statement, int columnIndex)
            throws SQLException {
        return read(statement.getArray(columnIndex));
    }

    private static List<String> read(Array array) throws SQLException {
        if (array == null) {
            return null;
        }
        try {
            return List.copyOf(Arrays.asList((String[]) array.getArray()));
        } finally {
            array.free();
        }
    }
}
