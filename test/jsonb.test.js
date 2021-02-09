const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../dist');
describe('JSONB attributes', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
    if(knexConfig.client !== 'postgres') return;
    describe(knexConfig.client, function() {
      let session, Person, Movie, MovieVersion;

      before(function () {
        session = testUtils.initialize(knexConfig);
        Person = session.models.Person;
        Movie = session.models.Movie;
        MovieVersion = session.models.MovieVersion;
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

      describe('JSONB filtering', function() {
        it('should work with simple string equality', async () => {
          const result = await buildFilter(Movie)
            .build({
              eager: {
                $where: {
                  'metadata:stringField': 'M99' 
                }
              }
            });
          result.should.be.an.an('array');
          result.should.have.length(1);
        });
        it('should work with numeric equality', async () => {
          const result = await buildFilter(Movie)
            .build({
              eager: {
                $where: {
                  'metadata:numberField': 1 
                }
              }
            });
          result.should.be.an.an('array');
          result.should.have.length(10);
        });
        it('should work with $or', async () => {
          const result = await buildFilter(Movie)
            .build({
              eager: {
                $where: {
                  'metadata:stringField': {
                    $or: [
                      {'$equals': 'M99'}, 
                      {'$equals': 'M98'}
                    ]
                  }
                }
              }
            })
          result.should.be.an.an('array');
          result.should.have.length(2);
        });
        it('should work with math operators', async () => {
          const result = await buildFilter(Movie)
            .build({
              eager: {
                $where: {
                  'metadata:numberField': {
                    $and: [
                      {'$gte': 2}, 
                      {'$lt': 4}
                    ]
                  }
                }
              }
            })
          result.should.be.an.an('array');
          result.should.have.length(20);
        });
      });
    });
  });
});
