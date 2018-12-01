const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('basic filters', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
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

      describe('filter attributes', function() {
        it('should limit', async () => {
          const result = await buildFilter(Person)
            .build({
              limit: 1
            });
          result.should.be.an.an('array');
          result.should.have.length(1);
        });

        it('should offset', async () => {
          const result = await buildFilter(Person)
            .build({
              limit: 1,
              offset: 1
            });
          result.should.be.an.an('array');
          result.should.have.length(1);
          result[0].firstName.should.equal('F01');
        });

        it('should select limited fields', async () => {
          const result = await buildFilter(Person)
            .build({
              limit: 1,
              fields: ['id']
            });
          result.should.be.an.an('array');
          result.should.have.length(1);
          _.keys(result[0]).should.deep.equal(['id']);
        });

        it('should order by descending', async () => {
          const result = await buildFilter(Person)
            .build({
              order: 'id desc'
            });
          result.should.be.an.an('array');
          result.map(item => item.id).should.deep.equal([
            10, 9, 8, 7, 6, 5, 4, 3, 2, 1
          ]);
        });

        it('should order by ascending', async () => {
          const result = await buildFilter(Person)
            .build({
              order: 'id asc'
            });
          result.should.be.an.an('array');
          result.map(item => item.id).should.deep.equal([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10
          ]);
        });

        it('should order by implicit ascending', async () => {
          const result = await buildFilter(Person)
            .build({
              order: 'id'
            });
          result.should.be.an.an('array');
          result.map(item => item.id).should.deep.equal([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10
          ]);
        });

        it('should order by multiple columns', async () => {
          const result = await buildFilter(Movie)
            .build({
              order: 'seq,id'
            });
          result.map(item => item.id).should.deep.equal(
            _.sortBy(result, ['seq', 'id']).map(({ id }) => id)
          );
        });

        it('should order by multiple columns with space', async () => {
          const result = await buildFilter(Movie)
            .build({
              order: 'seq, id'
            });
          result.map(item => item.id).should.deep.equal(
            _.sortBy(result, ['seq', 'id']).map(({ id }) => id)
          );
        });
      });

      describe('eager loaded data', function() {
        it('should include eagerly loaded data', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies'
            });
          result.should.be.an.an('array');
          _.forEach(person => person.movies.should.be.an.array);
        });

        it('should only select some fields on eagerly loaded models', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              fields: ['movies.id']
            });
          _.forEach(result, person => {
            _.forEach(person.movies, movie => {
              _.keys(movie).should.deep.equal(['id']);
            });
          });
        });

        it('should filter the root model', async () => {
          const result = await buildFilter(Person)
            .build({
              where: {
                firstName: 'F00'
              }
            });
          result.length.should.equal(1);
          result[0].firstName.should.equal('F00');
        });

        it('should filter eagerly loaded data using `where in`', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              where: {
                'movies.name': 'M99'
              }
            });
          // Should inclue all root models regardless of condition
          result.length.should.equal(10);
          _.forEach(result, person => {
            person.movies.forEach(movie => {
              movie.name.should.equal('M99');
            });
          });
        });

        it('should filter eagerly loaded 1-deep data using `join`', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'movies.name': 'M99'
              }
            });
          result.length.should.equal(1);
          result[0].firstName.should.equal('F00');
        });

        it('should filter eagerly loaded 2-deep data using `join`', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              require: {
                'parent.movies.name': 'M99'
              }
            });
          result.length.should.equal(1);
          result[0].firstName.should.equal('F01');
        });

        it('should require with composite keys', async () => {
          const result = await buildFilter(MovieVersion)
            .build({
              eager: 'movie',
              require: {
                'movie.name': 'M00'
              }
            });
          result.length.should.equal(1);
          result[0].movieId.should.equal(100);
          result[0].movie.name.should.equal('M00');
        });

        it('should order eagerly loaded model', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              order: 'movies.id asc',
              limit: 1
            });
          result.should.be.an.an('array');
          result.forEach(person => {
            [].concat(person.movies.map(movie => movie.id)).sort((a, b) => a > b)
              .should.deep.equal(
                person.movies.map(movie => movie.id)
              );
          });
        });

        it('should order eagerly loaded model descending', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: 'movies',
              order: 'movies.id desc',
              limit: 1
            });
          result.should.be.an.an('array');
          result.forEach(person => {
            [].concat(person.movies.map(movie => movie.id)).sort((a, b) => a < b)
              .should.deep.equal(
                person.movies.map(movie => movie.id)
              );
          });
        });
      });

      describe('controls and errors', function() {
        it('should limit eager expressions', async () => {
          try {
            await buildFilter(Person)
              .allowEager('pets')
              .build({
                eager: 'movies'
              });
          } catch (err) {
            return;
          }
          throw new Error('Eager expression should not be allowed');
        });
      });
    });
  });
});
