package com.robothree.central.persistence.schema;

import com.robothree.central.persistence.mybatis.schema.SchemaInspectionMapper;
import javax.sql.DataSource;
import org.apache.ibatis.logging.nologging.NoLoggingImpl;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;

final class SchemaMapperTestSession implements AutoCloseable {

    private final SqlSession session;

    private SchemaMapperTestSession(SqlSession session) {
        this.session = session;
    }

    static SchemaMapperTestSession open(DataSource dataSource) {
        Configuration configuration = new Configuration();
        configuration.setEnvironment(
                new Environment("alignment-2a-test", new JdbcTransactionFactory(), dataSource));
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(NoLoggingImpl.class);
        configuration.addMapper(SchemaInspectionMapper.class);
        SqlSessionFactory factory = new SqlSessionFactoryBuilder().build(configuration);
        return new SchemaMapperTestSession(factory.openSession(true));
    }

    SchemaInspectionMapper mapper() {
        return session.getMapper(SchemaInspectionMapper.class);
    }

    @Override
    public void close() {
        session.close();
    }
}
