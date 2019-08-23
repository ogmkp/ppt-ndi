const vbsBg = `
Dim objPPT
Dim TestFile
Dim opres
Set objPPT = CreateObject("PowerPoint.Application")

Sub Proc(ap)
	Dim sl
	Dim shGroup
	Dim sngWidth
	Dim sngHeight

	For Each sl In ap.Slides
		If sl.SlideShowTransition.Hidden Then
			Set objFileToWrite = CreateObject("Scripting.FileSystemObject").OpenTextFile(Wscript.Arguments.Item(1) & "/hidden.dat",8,true)
			objFileToWrite.WriteLine(sl.SlideIndex)
			objFileToWrite.Close
			Set objFileToWrite = Nothing
		End If

		Set objSlideEffect = CreateObject("Scripting.FileSystemObject").OpenTextFile(Wscript.Arguments.Item(1) & "/slideEffect.dat",8,true)
		objSlideEffect.WriteLine(sl.SlideIndex & "," & sl.SlideShowTransition.EntryEffect & "," & sl.SlideShowTransition.Duration)
		objSlideEffect.Close

		sl.Export Wscript.Arguments.Item(1) & "/Slide" & sl.SlideIndex & ".png", "PNG"
	Next
End Sub

sub Main()
	objPPT.DisplayAlerts = False
	Set ap = objPPT.Presentations.Open(Wscript.Arguments.Item(0), , , msoFalse)
	Proc(ap)

	For each opres In objPPT.Presentations
		TestFile = opres.FullName
		Exit For
	Next

	If TestFile = "" Then objPPT.Quit
	Set objPPT = Nothing
	Wscript.Echo "PPTNDI: Loaded"
End Sub
Main
`

const vbsNoBg = `
Dim objPPT
Dim TestFile
Dim opres
Set objPPT = CreateObject("PowerPoint.Application")

Sub Proc(ap)
	On Error Resume Next
	Dim sl
	Dim shGroup
	Dim sngWidth
	Dim sngHeight

	With ap.PageSetup
		sngWidth = .SlideWidth
		sngHeight = .SlideHeight
	End With

	For Each sl In ap.Slides
		If sl.SlideShowTransition.Hidden Then
			Set objFileToWrite = CreateObject("Scripting.FileSystemObject").OpenTextFile(Wscript.Arguments.Item(1) & "/hidden.dat",8,true)
			objFileToWrite.WriteLine(sl.SlideIndex)
			objFileToWrite.Close

			Set objFileToWrite = Nothing
		End If

		Set objSlideEffect = CreateObject("Scripting.FileSystemObject").OpenTextFile(Wscript.Arguments.Item(1) & "/slideEffect.dat",8,true)
		objSlideEffect.WriteLine(sl.SlideIndex & "," & sl.SlideShowTransition.EntryEffect & "," & sl.SlideShowTransition.Duration)
		objSlideEffect.Close

		Dim fn
		fn = Wscript.Arguments.Item(1) & "/Slide" & sl.SlideIndex & ".png"
		With sl.Shapes.AddTextBox( 1, 0, 0, sngWidth, sngHeight)
			Set shpGroup = sl.Shapes.Range()
			shpGroup.Export fn, 2, , , 1
			.Delete
		End With
		
		Set fso = CreateObject("Scripting.FileSystemObject")
		If fso.FileExists(fn) Then
			Set objFile = fso.GetFile(fn)
			If objFile.size = 0 Then
				For intShape = 1 To sl.Shapes.Count
					If sl.Shapes(intShape).Type = 7 Then
						sl.Shapes(intShape).Delete
					End If
				Next
				With sl.Shapes.AddTextBox( 1, 0, 0, sngWidth, sngHeight)
					Set shpGroup = sl.Shapes.Range()
					shpGroup.Export fn, 2, , , 1
					.Delete
				End With
			End If
		End If
	Next
End Sub

sub Main()
	objPPT.DisplayAlerts = False
	Set ap = objPPT.Presentations.Open(Wscript.Arguments.Item(0), , , msoFalse)
	Proc(ap)

	For each opres In objPPT.Presentations
		TestFile = opres.FullName
		Exit For
	Next

	If TestFile = "" Then objPPT.Quit
	Set objPPT = Nothing
	Wscript.Echo "PPTNDI: Loaded"
End Sub
Main
`;

$(document).ready(function() {
	const spawn = require( 'child_process' ).spawn;
	const { remote } = require('electron');
	const ipc = require('electron').ipcRenderer;
	const fs = require("fs-extra");
	const binPath = './bin/PPTNDI.EXE';
	let ioHook;
	let maxSlideNum = 0;
	let prevSlide = 1;
	let currentSlide = 1;
	let currentWindow = remote.getCurrentWindow();
	let slideWidth = 0;
	let slideHeight = 0;
	let spawn2pid = 0;
	let hiddenSlides = [];
	let slideEffects = {};
	let configData = {};
	let blkBool = false;
	let whtBool = false;
	let trnBool = false;
	let mustStop = false;
	let isLoaded = false;
	let isCancelTriggered = false;
	let numTypBuf = "";
	let tmpDir = "";
	let preTmpDir = "";
	let child;
	let repo;
	let slideTranTimers = [];

	try {
		process.chdir(remote.app.getAppPath().replace(/(\\|\/)resources(\\|\/)app\.asar/, ""));
	} catch(e) {
	}
	if (fs.existsSync(binPath)) {
		child = spawn(binPath);
		child.stdin.setEncoding('utf-8');
		child.stdout.pipe(process.stdout);
		//child.on('exit', function (code) {
		//	alert("EXITED " + code);
		//});
	} else {
		alert('Failed to create a listening server!');
		ipc.send('remote', "exit");
		return;
	}

	function stopSlideTransition() {
		for (var pp=2; pp<=9; pp++) {
			clearTimeout(slideTranTimers[pp]);
		}
		mustStop = true;
	}

	function createNullSlide() {
		const Jimp = require('jimp');
		Jimp.read(tmpDir + "/Slide1.png").then(image=> {
			slideWidth = image.bitmap.width;
			slideHeight = image.bitmap.height;
			$("#slide_res").html(slideWidth + " x " + slideHeight);
			new Jimp(image.bitmap.width, image.bitmap.height, (err, image2) => {
				image2.opacity(0);
				image2.write(tmpDir + "/Slide0.png");
			});
			new Jimp(image.bitmap.width, image.bitmap.height, 0x000000FF, (err, image2) => {
				image2.opacity(1);
				image2.write(tmpDir + "/SlideBlack.png");
			});
			new Jimp(image.bitmap.width, image.bitmap.height, 0xFFFFFFFF, (err, image2) => {
				image2.opacity(1);
				image2.write(tmpDir + "/SlideWhite.png");
			});
		});
	}

	function updateScreen() {
		let curSli, nextSli;
		let nextNum;
		let re, rpc;
		if(!repo) {
			return;
		}
		rpc = tmpDir + "/Slide";
		curSli = rpc + currentSlide.toString() + '.png';
		nextNum = currentSlide;
		nextNum++;
		$("select").find('option[value="Current"]').data('img-src', curSli);

		if (nextNum > maxSlideNum) {
			nextNum = 1;
		}
		if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
			nextSli = rpc + nextNum.toString() + '.png';
		} else {
			let cnts = 0;
			while (1) {
				if (!hiddenSlides.includes(nextNum + cnts)) {
					nextNum += cnts;
					nextSli = rpc + nextNum.toString() + '.png';
					break;
				}
				cnts++;
			}
		}

		$("select").find('option[value="Next"]').data('img-src', nextSli);
		initImgPicker();

		if (
		    $("#use_slide_transition").is(":checked") &&
		    ! (Object.entries(slideEffects).length === 0 && slideEffects.constructor === Object) &&
		    slideEffects[currentSlide.toString()].effectName !== "0"
		) {
			let duration = slideEffects[currentSlide.toString()].duration;
			const prevSli = rpc + prevSlide.toString() + '.png';
			const transLvl=9;
			try {
				for (var i=2; i<=transLvl; i++) {
					fs.unlinkSync(tmpDir + "/t" + i.toString() + ".png");
				}
			} catch(e) {
			}
			function sendSlides(i) {
				if (mustStop) {
					return;
				}
				function setLast() {
					if (mustStop) {
						return;
					}
					slideTranTimers[10] = setTimeout(function() {
						try {
							child.stdin.write(tmpDir + "/Slide" + currentSlide.toString() + ".png" + "\n");
						} catch(e) {
						}
					}, 10 * parseFloat(duration) * 50);
				}
				slideTranTimers[i] = setTimeout(function() {
					try {
						child.stdin.write(tmpDir + "/t" + i.toString() + ".png" + "\n");
					} catch(e) {
					}
				}, i * parseFloat(duration) * 50);
				if (i === transLvl) {
					setLast();
				}
			}

			function doTrans() {
				/*
				if (curSli === prevSli) {
					return;
				}
				*/
				let transSlidesCnt = 0;
				let transSlidesCnt2 = 0;

				const mergeImages = require('merge-images');
				stopSlideTransition();
				mustStop = false;

				for (let i=2; i<=transLvl; i++) {	
					mergeImages([
						{ src: prevSli, opacity: 1 - (0.1 * i) },
						{ src: curSli, opacity: 0.1 * i }
					])
					.then(b64 => {
						let b64data = b64.replace(/^data:image\/png;base64,/, "");
						let newi = 0;
						transSlidesCnt++;
						newi = transSlidesCnt + 1;
						fs.writeFile(tmpDir + "/t" + newi.toString() + ".png", b64data, 'base64', function(err) {
							transSlidesCnt2++;
							if (transSlidesCnt2 === 8) {
								transSlidesCnt = 0;
								transSlidesCnt2 = 0;
								for (var i2=2; i2<=transLvl; i2++) {
									sendSlides(i2);
								}
							}
						});
					});
				};
			}
			doTrans();

		} else {
			stopSlideTransition();
			try {
				child.stdin.write(curSli + "\n");
			} catch(e) {
			}
		}
		$("#slide_cnt").html("SLIDE " + currentSlide + " / " + maxSlideNum);
	}

	$("select").change(function() {
		if (repo == null) {
			repo = $(this);
		}
	});

	$("#with_background").click(function() {
		if (maxSlideNum > 0) {
			$("#reloadReq").toggle();
		}
	});

	function initImgPicker() {
		$("select").imagepicker({
			hide_select: true,
			show_label: true,
			selected:function(select, picker_option, event) {
				prevSlide = currentSlide;
				currentSlide=$('.selected').text();
				updateScreen();
			}
		});
		if ($("#trans_checker").is(":checked")) {
			$("#right img").css('background-image', "url('trans_slide.png')");
		} else {
			$("#right img").css('background-image', "url('null_slide.png')");
		}
	}

	function cancelLoad() {
		const kill  = require('tree-kill');
		kill(spawn2pid);
		cleanupForTemp();
		tmpDir = preTmpDir;
		$("#fullblack, .cancelBox").hide();
	}
		
	$("#load_pptx").click(function() {
		const {dialog} = require('electron').remote;
		$("#fullblack").show();
		isCancelTriggered = false;

		dialog.showOpenDialog(currentWindow,{
			properties: ['openFile'],
			filters: [
				{name: 'PowerPoint Presentations', extensions: ['pptx', 'ppt']},
				{name: 'All Files', extensions: ['*']}
			]
		}, function (file) {
			if (file !== undefined) {
				let re = new RegExp("\\.(ppt|pptx)\$", "i");
				let vbsDir, res;
				let fileArr = [];
				let options = "";
				if (re.exec(file)) {
					let now = new Date().getTime();
					let newVbsContent;
					const spawn2 = require( 'child_process' ).spawn;
					spawn2pid = spawn2.pid;
					preTmpDir = tmpDir;
					tmpDir = process.env.TEMP + '/ppt_ndi';
					if (!fs.existsSync(tmpDir)) {
						fs.mkdirSync(tmpDir);
					}
					tmpDir += '/' + now;
					fs.mkdirSync(tmpDir);
					vbsDir = tmpDir + '/wb.vbs';

					if ($("#with_background").is(":checked")) {
						newVbsContent = vbsBg;
					} else {
						newVbsContent = vbsNoBg;
					}

					try {
						fs.writeFileSync(vbsDir, newVbsContent, 'utf-8');
					} catch(e) {
						cleanupForTemp();
						tmpDir = preTmpDir;
						alert('Failed to access the temporary directory!');
						$("#fullblack, .cancelBox").hide();
						return;
					}
					res = spawn2( 'cscript.exe', [ vbsDir, file, tmpDir, "//NOLOGO", '' ] );
					$(".cancelBox").show();
					res.stderr.on('data', (data) => {
						maxSlideNum = 0;
						cleanupForTemp();
						tmpDir = preTmpDir;
						alert('Failed to parse the presentation!');
						$("#fullblack, .cancelBox").hide();
						return;
					});
					res.on('close', (code) => {
						let newMaxSlideNum = 0;
						if (tmpDir === "") {
							return;
						}
						fs.readdirSync(tmpDir).forEach(file2 => {
							re = new RegExp("^Slide(\\d+)\\.png\$", "i");
							if (re.exec(file2)) {
								let rpc = file2.replace(re, "\$1");
								fileArr.push(rpc);
								newMaxSlideNum++;
							}
						});
						if (isCancelTriggered) return;
						if (fileArr === undefined || fileArr.length == 0) {
							maxSlideNum = 0;
							cleanupForTemp();
							tmpDir = preTmpDir;
							alert("Presentation file could not be loaded.\n\nPlease check whether the presentension has one or more slides.\nAlso, please remove missing fonts if applicable.");
							$("#fullblack, .cancelBox").hide();
							return;
						}

						hiddenSlides = [];
						if (fs.existsSync(tmpDir + "/hidden.dat")) {
							const hs = fs.readFileSync(tmpDir + "/hidden.dat", { encoding: 'utf8' });
							hiddenSlides = hs.split("\n");
						}
						if (isCancelTriggered) return;
						hiddenSlides = hiddenSlides.filter(n => n);
						for (i = 0, len = hiddenSlides.length; i < len; i++) { 
							hiddenSlides[i] = parseInt(hiddenSlides[i], 10);
						}

						slideEffects = {};
						if (fs.existsSync(tmpDir + "/slideEffect.dat")) {
							const hs = fs.readFileSync(tmpDir + "/slideEffect.dat", { encoding: 'utf8' });
							const lines = hs.split(/(\r|\n)+/);
							for (i = 0; i < lines.length; i++) {
								let ls = lines[i].split(",");
								let obj = {
									"effectName" : ls[1],
									"duration" : ls[2]
								};
								slideEffects[ls[0].toString()] = obj;
							}
						}
						if (isCancelTriggered) return;

						fileArr.sort((a, b) => a - b).forEach(file2 => {
							let rpc = file2;
							let isHidden = false;
							options += '<option data-img-label="' + rpc + '"';

							for (i = 0, len = hiddenSlides.length; i < len; i++) { 
								let num = hiddenSlides[i];
								if (/^\d+$/.test(num)) {
									if (num == parseInt(rpc, 10)) {
										options += ' data-img-class="hiddenSlide" ';
										isHidden = true;
										break;
									}
								}
							}
							if (!isHidden && ( slideEffects[rpc].effectName !== "0" )) {
								options += ' data-img-class="transSlide" ';
							}

							options += ' data-img-src="' + tmpDir + '/Slide' + rpc + '.png" value="' + rpc + '">Slide ' + rpc + "\n";
							$("#slides_grp").html(options);
							$("select").find('option[value="Current"]').prop('img-src', tmpDir + "/Slide1.png");
							if (!fs.existsSync(tmpDir + "/Slide2.png")) {
								$("select").find('option[value="Next"]').prop('img-src', tmpDir + "/Slide1.png");
							} else {
								$("select").find('option[value="Next"]').prop('img-src', tmpDir + "/Slide2.png");
							}
						});
						$("#fullblack, .cancelBox, #reloadReq").hide();
						maxSlideNum = newMaxSlideNum;
						createNullSlide();
						if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
							selectSlide('1');
						} else {
							for (i = 1; i <= maxSlideNum; i++) {
								if (!hiddenSlides.includes(i)) {
									selectSlide(i.toString());
									break;
								}
							}
						}
						if (isLoaded) {
							cleanupForTemp(preTmpDir);
						}
						isLoaded = true;
					});
				} else {
					if (/\S/.test(file)) {
						alert("Only allowed filename extensions are PPT and PPTX.");
					}
					$("#fullblack, .cancelBox").hide();
				}
			} else {
				$("#fullblack, .cancelBox").hide();
			}
		});
	});

	function selectSlide(num) {
		blkBool = false;
		whtBool = false;
		trnBool = false;
		if (num == 0) {
			return;
		}
		if ( num > maxSlideNum ) {
			num = maxSlideNum;
		}
		$('optgroup[label="Slides"] option[value="' + num.toString() + '"]').prop('selected',true);
		$('optgroup[label="Slides"] option[value="' + num.toString() + '"]').change();
		prevSlide = currentSlide;
		currentSlide = num;

		let selected = $('.selected:eq( 0 )');
		if (selected.length) {
			$("#below").stop().animate(
			{ scrollTop: selected.position().top + $("#below").scrollTop() },
			  500, 'swing', function() {
			  });
		}

		updateScreen();
	}

	function gotoPrev() {
		let curSli;
		let re;
		if (!repo) {
			return;
		}
		curSli = currentSlide;
		if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
			curSli--;
			if (curSli == 0) {
				curSli = maxSlideNum;
			}
		} else {
			while (true) {
				curSli--;
				if (curSli == 0) {
					curSli = maxSlideNum;
				}
				if (!hiddenSlides.includes(curSli)) {
					break;
				}
			}
		}
		selectSlide(curSli.toString());
	}

	function gotoNext() {
		let curSli;
		let re;
		if (!repo) {
			return;
		}
		curSli = currentSlide;
		if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
			curSli++;
			if (curSli > maxSlideNum) {
				curSli = 1;
			}
		} else {
			while (true) {
				curSli++;
				if (curSli > maxSlideNum) {
					curSli = 1;
				}
				if (!hiddenSlides.includes(curSli)) {
					break;
				}
			}
		}
		selectSlide(curSli.toString());
	}
	
	$('#prev').click(function() {
		gotoPrev();
	});

	$('#next').click(function() {
		gotoNext();
	});

	function updateBlkWhtTrn(color) {
		let dirTo = "";
		switch (color) {
			case "black":
				whtBool = false;
				trnBool = false;
				if (blkBool) {
					blkBool = false;
					updateScreen();
					return;
				} else {
					blkBool = true;
					dirTo = tmpDir + "/SlideBlack.png";
				}
				break;
			case "white":
				blkBool = false;
				trnBool = false;
				if (whtBool) {
					whtBool = false;
					updateScreen();
					return;
				} else {
					whtBool = true;
					dirTo = tmpDir + "/SlideWhite.png";
				}
				break;
			case "trn":
				blkBool = false;
				whtBool = false;
				if (trnBool) {
					trnBool = false;
					updateScreen();
					return;
				} else {
					trnBool = true;
					dirTo = tmpDir + "/Slide0.png";
					color = "null";
				}
				break;
			default:
				break;
		}

		if (!fs.existsSync(dirTo)) {
			dirTo = __dirname.replace(/app\.asar(\\|\/)frontend/, "") + "/" + color + "_slide.png";
		}
		$("select").find('option[value="Current"]').data('img-src', dirTo);
		initImgPicker();

		try {
			child.stdin.write(dirTo + "\n");
		} catch(e) {
		}
	}

	$('#blk').click(function() {
		updateBlkWhtTrn("black");
	});

	$('#wht').click(function() {
		updateBlkWhtTrn("white");
	});

	$('#trn').click(function() {
		updateBlkWhtTrn("trn");
	});

	$(document).keydown(function(e) {
		let realNum = 0;
		if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) {
			return;
		}
		$("#below").trigger('click');
		if(e.which >= 48 && e.which <= 57) {
			// 0 through 9
			realNum = e.which - 48;
			numTypBuf += realNum.toString();
		} else if (e.which >= 96 && e.which <= 105) {
			// 0 through 9 (keypad)
			realNum = e.which - 96;
			numTypBuf += realNum.toString();
		} else if (e.which == 13) {
			// Enter
			if (numTypBuf == "") {
				gotoNext();
			} else {
				realNum = parseInt(numTypBuf, 10);
				selectSlide(realNum);
			}
			numTypBuf = "";
		} else if (e.which == 32 || e.which == 39 || e.which == 40 || e.which == 78 || e.which == 34) {
			// Spacebar, right arrow, down, N or page down
			numTypBuf = "";
			gotoNext();
		} else if(e.which == 37 || e.which == 8 || e.which == 38 || e.which == 80 || e.which == 33) {
			// Left arrow, backspace, up, P or page up
			numTypBuf = "";
			gotoPrev();
		} else if(e.which == 36) {
			// Home
			numTypBuf = "";
			if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
				selectSlide('1');
			} else {
				for (i = 1; i <= maxSlideNum; i++) {
					if (!hiddenSlides.includes(i)) {
						selectSlide(i.toString());
						break;
					}
				}
			}
		} else if(e.which == 35) {
			// End
			numTypBuf = "";
			if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
				selectSlide(maxSlideNum.toString());
			} else {
				for (i = maxSlideNum; i >= 1; i--) {
					if (!hiddenSlides.includes(i)) {
						selectSlide(i.toString());
						break;
					}
				}
			}

		} else if(e.which == 66) {
			// B
			numTypBuf = "";
			updateBlkWhtTrn("black");
		} else if(e.which == 84) {
			// T
			numTypBuf = "";
			updateBlkWhtTrn("trn");
		} else if(e.which == 87) {
			// W
			numTypBuf = "";
			updateBlkWhtTrn("white");
		} else if (e.ctrlKey) {
			numTypBuf = "";
			if (e.which == 87) {
				// Prevents Ctrl-W
				e.preventDefault();
				e.stopPropagation();
			}
		}
	});

	$('.button, .checkbox').keydown(function(e){
		if (e.which == 13 || e.which == 32) {
			// Enter or spacebar
			e.preventDefault();
			e.stopPropagation();
			gotoNext();
		}
	});

	function checkTime(i) {
		if (i < 10) {
			i = "0" + i;
		}
		return i;
	}

	function startCurrentTime() {
		let today = new Date();
		let h = today.getHours();
		let m = today.getMinutes();
		let s = today.getSeconds();
		let t;
		m = checkTime(m);
		s = checkTime(s);
		$('#current_time').html(h + ":" + m + ":" + s);
		t = setTimeout(startCurrentTime, 500);
	}

	function cleanupForTemp(myDir) {
		let dir = "";
		if (/\S/.test(myDir)) {
			dir = myDir;
		} else {
			dir = tmpDir;
		}
		if (dir === "") {
			return;
		}
		if (fs.existsSync(dir)) {
			fs.removeSync(dir);
		}
	}

	function cleanupForExit() {
		try {
			child.stdin.write("destroy\n");
		} catch(e) {
		}
		cleanupForTemp();
		ipc.send('remote', "exit");
	}

	function registerIoHook() {
		ioHook = require('iohook');
		ioHook.on('keyup', event => {
			if (event.shiftKey && event.ctrlKey) {
				let chr = String.fromCharCode( event.rawcode );
				if (chr === "") return;
				switch (chr) {
					case configData.hotKeys.prev: gotoPrev(); break;
					case configData.hotKeys.next: gotoNext(); break;
					case configData.hotKeys.transparent: updateBlkWhtTrn("trn"); break;
					case configData.hotKeys.black: updateBlkWhtTrn("black"); break;
					case configData.hotKeys.white: updateBlkWhtTrn("white"); break;
				}
			}
		});
		ioHook.start();
	}

	function reflectConfig() {
		const configFile = 'config.js';
		let configPath = "";
		const { remote } = require('electron');
		configPath = remote.app.getAppPath().replace(/(\\|\/)resources(\\|\/)app\.asar/, "") + "/" + configFile;
		if (!fs.existsSync(configPath)) {
			const appDataPath = process.env.APPDATA + "/PPT-NDI";
			configPath = appDataPath + "/" + configFile;
		}
		if (fs.existsSync(configPath)) {
			$.getJSON(configPath, function(json) {
				configData.hotKeys = json.hotKeys;
			});
		} else {
			// Do nothing
		}
	}

	ipc.on('remote' , function(event, data){
		if (data.msg == "exit") {
			cleanupForExit();
			return;
		}
		if (data.msg == "reload") {
			reflectConfig();
			return;
		}
	});

	$('#minimize').click(function() {
		remote.BrowserWindow.getFocusedWindow().minimize();
	});

	$('#max_restore').click(function() {
		if(currentWindow.isMaximized()) {
			remote.BrowserWindow.getFocusedWindow().unmaximize();
		} else {
			remote.BrowserWindow.getFocusedWindow().maximize();
		}
	});

	$('#cancel').click(function() {
		isCancelTriggered = true;
		cancelLoad();
	});

	$('#trans_checker').click(function() {
		if ($("#trans_checker").is(":checked")) {
			$("#right img").css('background-image', "url('trans_slide.png')");
		} else {
			$("#right img").css('background-image', "url('null_slide.png')");
		}
	});

	currentWindow.on('maximize', function (){
		$("#max_restore").attr("src", "restore.png");
    });

	currentWindow.on('unmaximize', function (){
		$("#max_restore").attr("src", "max.png");
    });
	
	$('#exit').click(function() {
		cleanupForExit();
	});

	document.addEventListener('dragover',function(event){
		event.preventDefault();
		return false;
	},false);
	
	document.addEventListener('drop',function(event){
		event.preventDefault();
		return false;
	},false);

	window.addEventListener("keydown", function(e) {
		if([32, 37, 38, 39, 40].indexOf(e.keyCode) > -1) {
			e.preventDefault();
		}
	}, false);

	initImgPicker();
	startCurrentTime();
	registerIoHook();
	reflectConfig();
});