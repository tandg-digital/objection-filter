const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('count queries', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
    describe(knexConfig.client, function () {
      let session, Person, builder;

      before(function () {
        session = testUtils.initialize(knexConfig);
        Person = session.models.Person;
      });

      before(function () {
        return testUtils.dropDb(session);
      });

      before(function () {
        return testUtils.createDb(session);
      });

      before(function () {
        return testUtils.insertData(session, { persons: 10, pets: 10, movies: 10 });
      });

      beforeEach(() => {
        builder = buildFilter(Person);
      });

      it('should count with a limit', async () => {
        const result = await builder.build({ limit: 1 });
        const count = await builder.count();
        result.length.should.equal(1);
        count.should.equal(10);
      });

      it('should count with an offset and limit', async () => {
        const result = await builder.build({ limit: 1, offset: 1 });
        const count = await builder.count();
        result.length.should.equal(1);
        count.should.equal(10);
      });

      it('should count with a where clause', async () => {
        const result = await builder.build({ where: { firstName: { $in: ['F00', 'F01'] } } });
        const count = await builder.count();
        result.length.should.equal(2);
        count.should.equal(2);
      });

      it('should count with a require clause', async () => {
        const result = await builder.build({
          require: {
            'movies.name': { $in: ['M09'] }
          }
        });
        const count = await builder.count();
        result.length.should.equal(1);
        count.should.equal(1);
      });

      it('should count with a where clause and limit', async () => {
        const result = await builder.build({
          where: { firstName: { $in: ['F00', 'F01', 'F02'] } },
          limit: 1
        });
        const count = await builder.count();
        result.length.should.equal(1);
        count.should.equal(3);
      });

      it('should count with a require clause and limit', async () => {
        const result = await builder.build({
          require: {
            'movies.name': { $in: ['M00', 'M10'] }
          },
          limit: 1
        });
        const count = await builder.count();
        result.length.should.equal(1);
        count.should.equal(2);
      });

      it('should count with an eager expression and limit', async () => {
        const result = await builder.build({ limit: 2, eager: 'movies' });
        const count = await builder.count();
        result.length.should.equal(2);
        count.should.equal(10);
      });

      it('should count with an eager.$where and limit', async () => {
        const result = await builder.build({
          limit: 1,
          eager: {
            $where: {
              'movies.name': { $in: ['M00', 'M10'] }
            },
            movies: true
          }
        });
        const count = await builder.count();
        result.length.should.equal(1);
        count.should.equal(2);
      });
    });
  });
});
