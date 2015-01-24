var WebGLManager = require('./WebGLManager'),
    RenderTarget = require('../utils/RenderTarget'),
    Quad = require('../utils/Quad'),
    math =  require('../../../math');

/**
 * @class
 * @namespace PIXI
 * @param renderer {WebGLRenderer} The renderer this manager works for.
 */
function FilterManager(renderer)
{
    WebGLManager.call(this, renderer);

    this.count = 0;

    /**
     * @member {any[]}
     */
    this.filterStack = [];

    this.filterStack.push({
        renderTarget:renderer.currentRenderTarget,
        filter:[],
        bounds:null
    });

    /**
     * @member {any[]]}
     */
    this.texturePool = [];

    // listen for context and update necessary buffers
    //TODO make this dynamic!
    this.textureSize = new math.Rectangle(0, 0, 800, 600);

    this.currentFrame = null;

    this.tempMatrix = new math.Matrix();
}

FilterManager.prototype = Object.create(WebGLManager.prototype);
FilterManager.prototype.constructor = FilterManager;
module.exports = FilterManager;


FilterManager.prototype.onContextChange = function ()
{
    this.texturePool.length = 0;
    
    var gl = this.renderer.gl;
    this.quad = new Quad(gl);
};

/**
 * @param renderer {WebGLRenderer}
 * @param buffer {ArrayBuffer}
 */
FilterManager.prototype.begin = function ()
{
    //TODO sort out bounds - no point creating a new rect each frame!
    //this.defaultShader = this.renderer.shaderManager.plugins.defaultShader;
    this.filterStack[0].renderTarget = this.renderer.currentRenderTarget;
    this.filterStack[0].bounds = this.renderer.currentRenderTarget.size;
};

/**
 * Applies the filter and adds it to the current filter stack.
 *
 * @param filterBlock {object} the filter that will be pushed to the current filter stack
 */
FilterManager.prototype.pushFilter = function (target, filters)
{
    // get the bounds of the object..
    var bounds = target.filterArea || target.getBounds();

    this.capFilterArea( bounds );

    var texture = this.getRenderTarget();

    // set the frame so the render target knows how much to render!
    texture.frame = bounds;
    
    this.renderer.setRenderTarget( texture );

    // clear the texture..
    texture.clear();
    
    // TODO get rid of object creation!
    this.filterStack.push({
        renderTarget:texture,
        filter:filters
    });

};


/**
 * Removes the last filter from the filter stack and doesn't return it.
 *
 */
FilterManager.prototype.popFilter = function ()
{
    var filterData = this.filterStack.pop();
    var previousFilterData = this.filterStack[this.filterStack.length-1];

    var input = filterData.renderTarget;

    var output = previousFilterData.renderTarget;
    

    // use program
    var gl = this.renderer.gl;
    var filter = filterData.filter[0];
    
    this.currentFrame = input.frame;

    this.quad.map(this.textureSize, input.frame);
    // TODO.. this probably only needs to be done once!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quad.indexBuffer);

    // this.__TEMP__ = filter.sprite;
    filter.applyFilter( this.renderer, input, output );

    this.returnRenderTarget( input );

    return filterData.filter;
};

FilterManager.prototype.getRenderTarget = function ()
{
    var renderTarget = this.texturePool.pop() || new RenderTarget(this.renderer.gl, this.textureSize.width, this.textureSize.height);
    renderTarget.frame = this.currentFrame; 
    return renderTarget;
};

FilterManager.prototype.returnRenderTarget = function (renderTarget)
{
    this.texturePool.push( renderTarget );
};

FilterManager.prototype.applyFilter = function (shader, inputTarget, outputTarget)
{
    var gl = this.renderer.gl;

    this.renderer.setRenderTarget( outputTarget );

    // set the shader
    this.renderer.shaderManager.setShader(shader);
    
    shader.uniforms.projectionMatrix.value = this.renderer.currentRenderTarget.projectionMatrix.toArray(true);

    //TODO can this be optimised?
    shader.syncUniforms();

    gl.vertexAttribPointer(shader.attributes.aVertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribPointer(shader.attributes.aTextureCoord, 2, gl.FLOAT, false, 0, 2 * 4 * 4);
    gl.vertexAttribPointer(shader.attributes.aColor, 4, gl.FLOAT, false, 0, 4 * 4 * 4);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTarget.texture);

    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0 );


      // var m = this.calculateMappedMatrix(inputTarget.frame, this.__TEMP__)

//    gl.uniformMatrix3fv(shader.uniforms.projectionMatrix._location, false, this.renderer.currentRenderTarget.projectionMatrix.toArray(true));
  //  gl.uniformMatrix3fv(shader.uniforms.otherMatrix._location, false, m.toArray(true));
/*
    /// custom //
    this.textureCount = 1;
    gl.activeTexture(gl.TEXTURE1);

    var maskTexture = shader.uniforms.mask.value.baseTexture;

    if (!maskTexture._glTextures[gl.id])
    {
        this.renderer.updateTexture(maskTexture);
    }
    else
    {
        // bind the texture
        gl.bindTexture(gl.TEXTURE_2D, shader.uniforms.mask.value.baseTexture._glTextures[gl.id]);
    }
    
    // set uniform to texture index
    gl.uniform1i(shader.uniforms.mask._location, 1);

    // increment next texture id
    this.textureCount++;

*/


};


// TODO playing around here.. this is temporary - (will end up in the shader)
FilterManager.prototype.calculateMappedMatrix = function (filterArea, sprite, outputMatrix)
{
    worldTransform = sprite.worldTransform.copy(math.Matrix.TEMP_MATRIX);
    texture = sprite.texture.baseTexture;

    var mappedMatrix = outputMatrix.identity();

    // scale..
    var ratio = this.textureSize.height / this.textureSize.width;

    mappedMatrix.translate(filterArea.x / this.textureSize.width, filterArea.y / this.textureSize.height );
    
    mappedMatrix.scale(1 , ratio);

    var translateScaleX = (this.textureSize.width / texture.width);
    var translateScaleY = (this.textureSize.height / texture.height);

    worldTransform.tx /= texture.width * translateScaleX;
    worldTransform.ty /= texture.width * translateScaleX;

    worldTransform.invert();

    mappedMatrix.prepend(worldTransform);

    // apply inverse scale..
    mappedMatrix.scale(1 , 1/ratio);

    mappedMatrix.scale( translateScaleX , translateScaleY );

    mappedMatrix.translate(sprite.anchor.x, sprite.anchor.y);

    return mappedMatrix;

    // Keeping the orginal as a reminder to me on how this works!
    //
    // var m = new math.Matrix();

    // // scale..
    // var ratio = this.textureSize.height / this.textureSize.width;

    // m.translate(filterArea.x / this.textureSize.width, filterArea.y / this.textureSize.height);
    

    // m.scale(1 , ratio);


    // var transform = wt.clone();
    
    // var translateScaleX = (this.textureSize.width / 620);
    // var translateScaleY = (this.textureSize.height / 380);

    // transform.tx /= 620 * translateScaleX;
    // transform.ty /= 620 * translateScaleX;

    // transform.invert();

    // transform.append(m);

    // // apply inverse scale..
    // transform.scale(1 , 1/ratio);

    // transform.scale( translateScaleX , translateScaleY );

    // return transform;
};

FilterManager.prototype.capFilterArea = function (filterArea)
{
    if (filterArea.x < 0)
    {
        filterArea.width += filterArea.x;
        filterArea.x = 0;
    }

    if (filterArea.y < 0)
    {
        filterArea.height += filterArea.y;
        filterArea.y = 0;
    }

    if ( filterArea.x + filterArea.width > this.textureSize.width )
    {
        filterArea.width = this.textureSize.width - filterArea.x;
    }

    if ( filterArea.y + filterArea.height > this.textureSize.height )
    {
        filterArea.height = this.textureSize.height - filterArea.y;
    }
};

/**
 * Destroys the filter and removes it from the filter stack.
 *
 */
FilterManager.prototype.destroy = function ()
{
    this.filterStack = null;
    this.offsetY = 0;

    // destroy textures
    for (var i = 0; i < this.texturePool.length; i++)
    {
        this.texturePool[i].destroy();
    }

    this.texturePool = null;
};
