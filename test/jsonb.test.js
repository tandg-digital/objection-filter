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
                  'metadata$stringField': 'M99' 
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
                  'metadata$numberField': 1 
                }
              }
            });
          result.should.be.an.an('array');
          result.should.have.length(10);
        });
        it('should work with logical operators', async () => {
          const result = await buildFilter(Movie)
            .build({
              eager: {
                $where: {
                  'metadata$stringField': {
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
                  'metadata$numberField': {
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
        it('should work nested object properties', async () => {
          const result = await buildFilter(Movie)
            .build({
              eager: {
                $where: {
                  'metadata$objectField.numberField': 1
                }
              }
            });
          result.should.be.an.an('array');
          result.should.have.length(10);
        });
        it('should support boolean types', async () => {
          const result = await buildFilter(Movie)
            .build({
              where: {
                'metadata$booleanField': false
              }
            });
          result.length.should.be.greaterThan(0);
          for(const row of result){
            row.metadata.booleanField.should.equal(false);
          }
        })
        it('should support require and eager with relations', async () =>{
          const result = await buildFilter(Person)
            .build({
              eager: 'pets',
              require: {
                'movies.metadata$stringField': 'M99' 
              },
              where: {
                'pets.name': 'P00'
              }
            });

          result.length.should.equal(1);
          const person = result[0];
          person.firstName.should.equal('F00');
          person.pets.should.be.an('array');
          person.pets.length.should.equal(1);
          person.pets[0].name.should.equal('P00');
        })
        it('should eager joins with fullyQualifiedProperties', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'parent.movies.metadata$stringField': 'M99' 
              }
            });
          result.length.should.equal(1);
          result[0].firstName.should.equal('F01');
        });
      });
    });
  });
});
