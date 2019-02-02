const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

const { NUMERIC_SORT } = testUtils;

/**
 * Create an array of items composed of counts = [n0, n1, n2...] with items
 * from the corresponding index of the objects list
 * fillArray([2, 3], [0, 1]) = [0,0,1,1,1]
 * @param {Array<Integer>} counts
 * @param {Array<any>} objects
 */
const fillArray = function(counts = [], objects = []) {
  const results = [];
  for (let i = 0; i < counts.length; i += 1) {
    for (let j = 0; j < counts[i]; j += 1) {
      results.push(objects[i]);
    }
  }
  return results;
};

describe('aggregation', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
    describe(knexConfig.client, function() {
      let session, Person, Animal, MovieVersion, Movie;

      before(function () {
        session = testUtils.initialize(knexConfig);
        Person = session.models.Person;
        Animal = session.models.Animal;
        MovieVersion = session.models.MovieVersion;
        Movie = session.models.Movie;
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

      describe('defaults', function() {
        it('should skip if aggregations = []', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: []
              }
            });
          result.map(item => item.count).should.deep.equal(fillArray([10], [undefined]));
        });

        it('should default to "count"', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    relation: 'pets'
                  }
                ]
              }
            });
          result.map(item => item.count).should.deep.equal(fillArray([10], [10]));
        });
      });

      describe('count without filters', function() {
        it('should count using 1-level hasMany', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'pets'
                  }
                ]
              }
            });
          result.map(item => item.count).should.deep.equal(fillArray([10], [10]));
        });

        it('should count using 1-level manyToMany', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'movies'
                  }
                ]
              }
            });
          result.map(item => item.count).sort(NUMERIC_SORT)
            .should.deep.equal(fillArray([10], [10]));
        });

        it('should count using 1-level belongsTo', async () => {
          const result = await buildFilter(Animal)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'owner'
                  }
                ]
              }
            });
          const counts = result.map(item => item.count);
          counts.length.should.equal(100);
          _.uniq(counts).should.deep.equal([1]);
        });

        it('should count using 2-level manyToMany', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'movies.category'
                  }
                ]
              }
            });
          const counts = result.map(item => item.count);
          counts.length.should.equal(10);
          _.uniq(counts).should.deep.equal([10]);
        });

        it('should count distinct using 2-level manyToMany', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'movies.category'
                  }
                ]
              }
            });
          const counts = result.map(item => item.count);
          counts.length.should.equal(10);
          _.uniq(counts).should.deep.equal([10]);
        });

        it('should count using 2-level belongsTo', async () => {
          const result = await buildFilter(Animal)
            .build({
              eager: {
                owner: {
                  movies: true
                },
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'owner.movies'
                  }
                ]
              }
            });
          const counts = result.map(item => item.count);
          counts.length.should.equal(100);
          _.uniq(counts).should.deep.equal([10]);
        });
      });

      describe('count with filters', function() {
        it('should count using 1-level manyToMany', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'movies',
                    $where: {
                      'category.id': { $gt: 2 }
                    }
                  }
                ]
              }
            });
          result.map(item => item.count).sort(NUMERIC_SORT).should.deep.equal(
            fillArray([2, 8], [0, 10])
          );
        });
      });

      describe('count distinct', function() {
        it('should apply 3-level relation', async () => {
          const result = await buildFilter(Animal)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    distinct: true,
                    relation: 'owner.movies.category'
                  }
                ]
              }
            });
          const counts = result.map(item => item.count);
          counts.length.should.equal(100);
          _.uniq(counts).should.deep.equal([1]);
        });

        it('should apply distinct with filter', async () => {
          const result = await buildFilter(Animal)
            .build({
              order: 'count desc',
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    distinct: true,
                    relation: 'owner.movies.category',
                    $where: {
                      name: 'C00'
                    }
                  }
                ]
              }
            });
          const counts = result.map(item => item.count);
          counts.length.should.equal(100);
          counts.should.deep.equal(fillArray([10, 90], [1, 0]));
        });
      });

      describe('composite ids', function() {
        it('should aggregate if root model has composite id', async function() {
          const result = await buildFilter(MovieVersion)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'movie'
                  }
                ]
              }
            });
          result.map(item => item.count).should.deep.equal(fillArray([100], [1]));
        });

        it('should aggregate if outer model has composite id', async () => {
          // Ensure that 0-counts work as expected, rather than 1 on something like count(*)
          await MovieVersion.query()
            .delete()
            .where({ movieId: 1 });

          const result = await buildFilter(Movie)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'version'
                  }
                ]
              },
              order: 'id'
            });
          result.map(item => item.count).should.deep.equal(fillArray([1, 99], [0, 1]));
        });
      });

      describe('multiple aggregations', function() {
        it('should apply multiple counts', async () => {
          const result = await buildFilter(Animal)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'owner',
                    alias: 'count1'
                  },
                  {
                    type: 'count',
                    relation: 'owner.movies',
                    alias: 'count2'
                  }
                ]
              }
            });
          const counts = result.map(({ count1, count2 }) => ({ count1, count2 }));
          counts.should.deep.equal(fillArray([100], [{ count1: 1, count2: 10 }]));
        });

        it('should apply multiple counts with filtering', async () => {
          const result = await buildFilter(Animal)
            .build({
              order: 'id',
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'owner',
                    $where: {
                      id: 2
                    },
                    alias: 'count1'
                  },
                  {
                    type: 'count',
                    relation: 'owner',
                    alias: 'count2',
                    $where: {
                      id: { $gt: 1 }
                    }
                  }
                ]
              }
            });
          const counts = result.map(({ count1, count2 }) => ({ count1, count2 }));
          counts.should.deep.equal(
            fillArray([10, 10, 80], [
              { count1: 0, count2: 0 },
              { count1: 1, count2: 1 },
              { count1: 0, count2: 1 }
            ])
          );
        });
      });

      describe('alternate aggregations', function() {
        it('should apply sum', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'sum',
                    field: 'id',
                    relation: 'movies'
                  }
                ]
              }
            });
          const counts = result.map(item => item.count);
          counts.length.should.equal(10);
          counts.sort(NUMERIC_SORT).should.deep.equal([
            55,
            155,
            255,
            355,
            455,
            555,
            655,
            755,
            855,
            955
          ]);
        });

        it('should throw an asynchronous error with unspecified field', async () => {
          try {
            await buildFilter(Person)
              .build({
                eager: {
                  $aggregations: [
                    {
                      type: 'sum',
                      field: 'asdfsdfasdf',
                      relation: 'movies'
                    }
                  ]
                }
              });
          } catch (err) {
            return;
          }
          throw new Error('should have failed validation');
        });

        it('should throw a synchronous error with an invalid type', async () => {
          try {
            await buildFilter(Person)
              .build({
                eager: {
                  $aggregations: [
                    {
                      type: 'fasdfasd',
                      field: 'id',
                      relation: 'movies'
                    }
                  ]
                }
              });
          } catch (err) {
            return;
          }
          throw new Error('should have failed validation');
        });

        it('should throw a synchronous error with type != "count" and "field" = undefined', async () => {
          try {
            await buildFilter(Person)
              .build({
                eager: {
                  $aggregations: [
                    {
                      type: 'sum',
                      relation: 'movies'
                    }
                  ]
                }
              });
          } catch (err) {
            return;
          }
          throw new Error('should have failed validation');
        });
      });

      describe('integration', function() {
        it('should apply distinct with filter', async () => {
          const result = await buildFilter(Animal)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    distinct: true,
                    relation: 'owner.movies.category'
                  }
                ],
                $where: {
                  id: 1
                }
              }
            });
          const counts = result.map(item => item.count);
          counts.should.deep.equal([1]);
        });

        it('should allow ordering based on the aggregated field', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'sum',
                    alias: 'movieIdSum',
                    relation: 'movies',
                    field: 'id'
                  }
                ]
              },
              order: 'movieIdSum desc',
              limit: 5
            });
          result.map(item => item.firstName).should.deep.equal([
            'F09', 'F08', 'F07', 'F06', 'F05'
          ]);
        });
      });

      describe('filtering on aggregated fields', function() {
        it('should allow applying top level $where to an aggregation', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'sum',
                    alias: 'movieIdSum',
                    distinct: true,
                    relation: 'movies',
                    field: 'id'
                  }
                ],
                $where: {
                  movieIdSum: { $gt: 500 }
                }
              }
            });
          result.map(item => item.firstName).should.deep.equal([
            'F05', 'F06', 'F07', 'F08', 'F09'
          ]);
        });
      });

      describe('onAggBuild', function() {
        it('should return zero owners when filtered', async () => {
          const onAggBuild = function(RelatedModelClass) {
            return RelatedModelClass.query()
              .where({ id: 34343 });
          };

          const result = await buildFilter(Animal, null, { onAggBuild })
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'owner',
                    alias: 'count'
                  }
                ]
              }
            });
          const counts = result.map(({ count }) => count);
          _.uniq(counts).should.deep.equal([0]);
        });

        it('should return zero for all owners where firstName !== "F00"', async () => {
          const onAggBuild = function(RelatedModelClass) {
            if (RelatedModelClass.name === 'Person') {
              return RelatedModelClass.query()
                .where({ firstName: 'F00' });
            }
          };

          const result = await buildFilter(Animal, null, { onAggBuild })
            .build({
              order: 'count desc',
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    distinct: true,
                    relation: 'owner.movies'
                  }
                ]
              }
            });
          const counts = result.map(item => item.count);
          counts.length.should.equal(100);
          counts.should.deep.equal(fillArray([10, 90], [10, 0]));
        });
      });
    });
  });
});
