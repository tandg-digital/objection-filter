const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

describe('aggregation', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
    describe(knexConfig.client, function() {
      let session, Person, Animal;

      before(function () {
        session = testUtils.initialize(knexConfig);
        Person = session.models.Person;
        Animal = session.models.Animal;
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

      describe('count with filters', function() {
        it('should count using 1-level manyToMany', done => {
          buildFilter(Person)
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
            })
            .then(result => {
              result.map(item => item.count).should.deep.equal([
                0,
                0,
                10,
                10,
                10,
                10,
                10,
                10,
                10,
                10
              ]);
              done();
            })
            .catch(done);
        });
      });

      describe('count without filters', function() {
        it('should count using 1-level hasMany', done => {
          buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'pets'
                  }
                ]
              }
            })
            .then(result => {
              result.map(item => item.count).should.deep.equal([
                10,
                10,
                10,
                10,
                10,
                10,
                10,
                10,
                10,
                10
              ]);
              done();
            })
            .catch(done);
        });

        it('should count using 1-level manyToMany', done => {
          buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'movies'
                  }
                ]
              }
            })
            .then(result => {
              result.map(item => item.count).should.deep.equal([
                10,
                10,
                10,
                10,
                10,
                10,
                10,
                10,
                10,
                10
              ]);
              done();
            })
            .catch(done);
        });

        it('should count using 1-level belongsTo', done => {
          buildFilter(Animal)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'owner'
                  }
                ]
              }
            })
            .then(result => {
              const counts = result.map(item => item.count);
              counts.length.should.equal(100);
              _.uniq(counts).should.deep.equal([1]);
              done();
            })
            .catch(done);
        });

        it('should count using 2-level manyToMany', done => {
          buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'movies.category'
                  }
                ]
              }
            })
            .then(result => {
              const counts = result.map(item => item.count);
              counts.length.should.equal(10);
              _.uniq(counts).should.deep.equal([10]);
              done();
            })
            .catch(done);
        });

        it('should count distinct using 2-level manyToMany', done => {
          buildFilter(Person)
            .build({
              eager: {
                $aggregations: [
                  {
                    type: 'count',
                    relation: 'movies.category'
                  }
                ]
              }
            })
            .then(result => {
              const counts = result.map(item => item.count);
              counts.length.should.equal(10);
              _.uniq(counts).should.deep.equal([10]);
              done();
            })
            .catch(done);
        });

        it('should count using 2-level belongsTo', done => {
          buildFilter(Animal)
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
            })
            .then(result => {
              const counts = result.map(item => item.count);
              counts.length.should.equal(100);
              _.uniq(counts).should.deep.equal([10]);
              done();
            })
            .catch(done);
        });
      });

      describe('count distinct', function() {
        it('should apply 3-level relation', done => {
          buildFilter(Animal)
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
            })
            .then(result => {
              const counts = result.map(item => item.count);
              counts.length.should.equal(100);
              _.uniq(counts).should.deep.equal([1]);
              done();
            })
            .catch(done);
        });

        it('should apply distinct with filter', done => {
          buildFilter(Animal)
            .build({
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
            })
            .then(result => {
              const counts = result.map(item => item.count);
              counts.length.should.equal(100);
              const ones = [];
              for (let i = 0; i < 100; i += 1) {
                ones.push(i < 10 ? 1 : 0);
              }
              counts.should.deep.equal(ones);
              done();
            })
            .catch(done);
        });
      });

      describe('multiple aggregations', function() {
        it('should apply multiple counts', done => {
          buildFilter(Animal)
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
            })
            .then(result => {
              const counts = result.map(({ count1, count2 }) => ({ count1, count2 }));
              const stub = [];
              for (let i = 0; i < 100; i += 1) {
                stub.push({ count1: 1, count2: 10 });
              }
              counts.should.deep.equal(stub);
              done();
            })
            .catch(done);
        });

        it('should apply multiple counts with filtering', done => {
          buildFilter(Animal)
            .build({
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
            })
            .then(result => {
              done();
            })
            .catch(done);
        });
      });

      describe('integration', function() {

      });
    });
  });
});
